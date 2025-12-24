
import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  Logger,
  NotFoundException,
  InternalServerErrorException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Any, Repository } from 'typeorm';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { User } from '../../entities/User.entity';
import { RefreshToken } from '../../entities/Refresh-token.entity';
import { OtpVerification } from '../../entities/Otp-verification.entity';
import { PasswordHashUtil } from '../../common/utils/password-hash.util';
import { OtpUtil } from '../../common/utils/otp.util';
import { MailerProvider } from '../../providers/mailer.provider';
import { KafkaProvider } from '../../providers/kafka.provider';
import { RolesService } from '../RolesModule/roles.service';
import { RegisterDto } from './dtos/register.dto';
import { VerifyOtpDto } from './dtos/verify-otp.dto';
import { ResendOtpDto } from './dtos/resend-otp.dto';
import { ForgotPasswordDto } from './dtos/forgot-password.dto';
import { ResetPasswordDto } from './dtos/reset-password.dto';
import { RefreshTokenDto } from './dtos/refresh-token.dto';
import { Role } from '../../entities/Role.entity';
import { UserRole } from '../../entities/User-role.entity';
import { CustomerGrowthDto } from '../Analytics/dto/customer-growth.dto';
import { CustomerGrowthQueryDto, TrendPeriod } from '../Analytics/dto/customer-growth-query.dto';
import * as dayjs from 'dayjs';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,

    @InjectRepository(RefreshToken)
    private readonly tokenRepo: Repository<RefreshToken>,

    @InjectRepository(Role)
    private readonly roleRepo: Repository<Role>,

    @InjectRepository(UserRole)
    private readonly userRoleRepo: Repository<UserRole>,

    @InjectRepository(OtpVerification)
    private readonly otpRepo: Repository<OtpVerification>,

    private readonly jwtService: JwtService,
    private readonly mailer: MailerProvider,
    private readonly kafka: KafkaProvider,
    private readonly rolesService: RolesService,
    private readonly httpService: HttpService,
    
  ) {}

  async register(dto: RegisterDto) {
  // basic validation
  if (!dto.email || !dto.password) {
    throw new BadRequestException('Email and password are required.');
  }

  // quick uniqueness check (email, username, phone)
  const existing = await this.userRepo.findOne({
    where: [
      { email: dto.email },
      { username: dto.username },
      { phone: dto.phone },
    ],
  });

  if (existing) {
    if (existing.email === dto.email) {
      throw new BadRequestException('Email is already in use. Please use a different email.');
    }
    if (dto.phone && existing.phone === dto.phone) {
      throw new BadRequestException('Phone number is already in use. Please use a different phone number.');
    }
    throw new BadRequestException('Provided credentials are already in use.');
  }

  // hash password
  const hash = await PasswordHashUtil.hash(dto.password);

  // generate OTP
  const otpPlain = OtpUtil.generateOtp();
  const otpHash = crypto.createHash('sha256').update(otpPlain).digest('hex');
  const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  let savedUser: User;
  
  try {
    const result = await this.userRepo.manager.transaction(async (manager) => {
      const uRepo = manager.getRepository(User);
      const rRepo = manager.getRepository(Role);
      const urRepo = manager.getRepository(UserRole);
      const oRepo = manager.getRepository(this.otpRepo.metadata.target as any); // or manager.getRepository(OtpEntity)

      // create & save user
      const user = uRepo.create({
        username: dto.username,
        email: dto.email,
        password_hash: hash,
        phone: dto.phone,
        is_verified: false,
      });
      const saved = await uRepo.save(user);

      // ensure customer role exists
      let customerRole = await rRepo.findOne({ where: { name: 'customer' } });
      if (!customerRole) {
        customerRole = rRepo.create({
          name: 'customer',
          description: 'Default customer role',
        } as Partial<Role>);
        customerRole = await rRepo.save(customerRole);
      }

      // assign role
      const userRole = urRepo.create({
        user_id: saved.user_id,
        role_id: customerRole.role_id,
      });
      await urRepo.save(userRole);

      // create OTP record (hashed)
      const otpRecord = oRepo.create({
        user: saved,
        otp_hash: otpHash,
        purpose: 'registration',
        channel: 'email',
        expires_at: otpExpiresAt,
      });
      await oRepo.save(otpRecord);

      return { savedUser: saved };
    });

    savedUser = result.savedUser;
  } catch (err) {
    const code = (err as any).code;
    const detail = (err as any).detail || '';
    const message = (err as any).message || '';

    // Postgres unique violation
    if (code === '23505') {
      const colMatch = detail.match(/Key \((.*?)\)=/i);
      const col = colMatch ? colMatch[1] : null;

      if (col === 'phone') {
        throw new BadRequestException('Phone number is already in use. Please use a different phone number.');
      }
      if (col === 'email') {
        throw new BadRequestException('Email is already in use. Please use a different email.');
      }

      throw new BadRequestException('A record with the same unique value already exists.');
    }

    // MySQL duplicate entry
    if (code === 'ER_DUP_ENTRY' || code === 1062 || /Duplicate entry/i.test(message)) {
      const myMatch = message.match(/for key '?(.*?)'?(?:$|;)/i);
      const key = myMatch ? myMatch[1] : '';
      const keyLower = key.toLowerCase();

      if (keyLower.includes('phone')) {
        throw new BadRequestException('Phone number is already in use. Please use a different phone number.');
      }
      if (keyLower.includes('email')) {
        throw new BadRequestException('Email is already in use. Please use a different email.');
      }
      if (keyLower.includes('username')) {
        throw new BadRequestException('Username is already taken. Please choose another username.');
      }

      throw new BadRequestException('A record with the same unique value already exists.');
    }

    // unknown error
    this.logger.error('Failed to register user (unexpected error)', (err as any).stack || err);
    throw new InternalServerErrorException('Failed to register user. Please try again later.');
  }

  // non-fatal post-transaction work
  try {
    await this.mailer.sendOtpEmail(savedUser.email, otpPlain);
  } catch (err) {
    this.logger?.error('Failed to send OTP email', err as any);
  }

  try {
    await this.kafka.emit('identity.user.registered', {
      user_id: savedUser.user_id,
      email: savedUser.email,
      created_at: savedUser.created_at,
    });
  } catch (err) {
    this.logger?.warn('Failed to emit identity.user.registered event', err as any);
  }

  return { user_id: savedUser.user_id, message: 'verification_sent' };
}


  async verifyOtp(dto: VerifyOtpDto) {
    const user = await this.userRepo.findOne({ where: { email: dto.email } });
    if (!user) throw new BadRequestException('User not found');

    const otpHash = crypto.createHash('sha256').update(dto.otp).digest('hex');
    const record = await this.otpRepo.findOne({
      where: {
        user: { user_id: user.user_id },
        otp_hash: otpHash,
        used: false,
      },
      order: { created_at: 'DESC' },
      relations: ['user'],
    });

    if (!record) throw new BadRequestException('Invalid or expired OTP');
    if (record.expires_at < new Date()) {
      throw new BadRequestException('OTP expired');
    }

    record.used = true;
    await this.otpRepo.save(record);

    user.is_verified = true;
    user.verified_at = new Date();
    await this.userRepo.save(user);

    await this.kafka.emit('identity.user.verified', {
      user_id: user.user_id,
      verified_at: user.verified_at,
    });
    return { ok: true };
  }

  
  async validateUserCredentials(email: string, password: string): Promise<User> {
    const user = await this.userRepo.findOne({
      where: { email },
      relations: [
        'roles',
        'roles.role',
        'roles.role.rolePermissions',
        'roles.role.rolePermissions.permission',
      ],
    });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) throw new UnauthorizedException('Invalid credentials');

    if (!user.is_verified) {
      throw new UnauthorizedException('Please verify your account first');
    }

    return user;
  }

async login(user: User, deviceInfo: string, ip: string, remember = false) {
  const roles = (user.roles ?? []).map((ur) => ur.role?.name).filter(Boolean) as string[];
  console.log(user);
  let permissions = (user.roles ?? [])
    .flatMap((ur) => ur.role?.rolePermissions ?? [])
    .map((rp) => rp.permission?.name)
    .filter(Boolean) as string[];

  if (!permissions || permissions.length === 0) {
    try {
      const rows = await this.userRepo.manager
        .createQueryBuilder()
        .select('p.name', 'name')
        .from('role_permissions', 'rp')
        .innerJoin('permissions', 'p', 'p.permission_id = rp.permission_id')
        .innerJoin('roles', 'r', 'r.role_id = rp.role_id')
        .innerJoin('user_roles', 'ur', 'ur.role_id = r.role_id')
        .where('ur.user_id = :uid', { uid: user.user_id })
        .distinct(true)
        .getRawMany();
      permissions = Array.from(new Set(rows.map((r: any) => r.name).filter(Boolean)));
    } catch (err) {
      this.logger.warn('Permission fallback query failed', err as any);
      permissions = permissions ?? [];
    }
  }

  const uniqueRoles = Array.from(new Set(roles));
  const uniquePermissions = Array.from(new Set(permissions));

  // --- NEW: find restaurant_id if user is a restaurant_owner ---
  let restaurantId: string | undefined = undefined;
try {
  // const isOwner = uniqueRoles.some((r) => (r ?? '').toLowerCase() === 'restaurant_owner');
  // if (isOwner) {
    // using your DB shape: restaurants.id and restaurants.owner_id
    const row = await this.userRepo.manager
      .createQueryBuilder()
      .select('r.id', 'restaurant_id')
      .from('restaurants', 'r')
      .where('r.owner_id = :uid', { uid: user.user_id })
      .limit(1)
      .getRawOne();

    restaurantId = row?.restaurant_id ?? undefined;
    if (!restaurantId) {
      this.logger.debug(`User ${user.user_id} has role restaurant_owner but no restaurants found`);
    // }
  }
} catch (err) {
  this.logger.warn('Failed to fetch restaurant_id for restaurant_owner', err as any);
  restaurantId = undefined;
}

  const payloadForAccess: any = {
    sub: user.user_id,
    email: user.email,
    username: user.username,
    phone: user.phone,
    roles: uniqueRoles,
    permissions: uniquePermissions,
  };

  if (restaurantId) {
    // include restaurant id claim only when available
    payloadForAccess.restaurant_id = restaurantId;
  }

  // Access token (short-lived)
  const accessExpiry = process.env.JWT_ACCESS_EXPIRES ?? '24h';
  const accessToken = this.jwtService.sign(payloadForAccess, { expiresIn: accessExpiry });
  const refreshDays = remember ? Number(process.env.JWT_REMEMBER_DAYS ?? 30) : Number(process.env.JWT_REFRESH_DAYS ?? 7);
  const refreshExpiry = `${refreshDays}d`;
  const expiresAt = new Date(Date.now() + refreshDays * 24 * 60 * 60 * 1000);

  const tokenRecord = this.tokenRepo.create({
    user,
    token_hash: '', // will set after signing
    expires_at: expiresAt,
    revoked: false,
  } as Partial<RefreshToken>);

  const savedToken = await this.tokenRepo.save(tokenRecord);

  // 3) sign refresh token including tid claim (token id)
  const refreshPayload = {
    sub: user.user_id,
    tid: savedToken.id,
  };
  const refreshTokenPlain = this.jwtService.sign(refreshPayload, { expiresIn: refreshExpiry });

  // 4) hash and persist refresh token
  const hash = await bcrypt.hash(refreshTokenPlain, 10);
  savedToken.token_hash = hash;
  await this.tokenRepo.save(savedToken);

  // return tokens + meta (include restaurant_id if present)
  return {
    accessToken,
    refreshToken: refreshTokenPlain,
    roles: uniqueRoles,
    permissions: uniquePermissions,
    token_id: savedToken.id,
    expires_at: expiresAt,
    remember,
    restaurant_id: restaurantId ?? null,
  };
}


async ssoLogin(token: string, provider: string, userAgent: string, ip: string) {
  let profile: any;
  if (provider === 'google') {
    // Use unsafe verification if no client secret (for development)
    if (!process.env.GOOGLE_CLIENT_SECRET) {
      profile = await this.verifyGoogleTokenUnsafe(token);
    } else {
      profile = await this.verifyGoogleToken(token);
    }
  } else if (provider === 'facebook') {
    // Use unsafe verification if no app secret (for development)
    if (!process.env.FACEBOOK_APP_SECRET) {
      profile = await this.verifyFacebookTokenUnsafe(token);
    } else {
      profile = await this.verifyFacebookToken(token);
    }
  } else {
    throw new BadRequestException('Unsupported provider');
  }

  // Find existing user by email or provider_id
  let user = await this.userRepo.findOne({
    where: [
      { email: profile.email },
      { provider: provider, provider_id: profile.id },
    ],
    relations: ['roles'],
  });

  if (!user) {
    // Create new user
    user = this.userRepo.create({
      email: profile.email,
      username: profile.email.split('@')[0], // or generate unique
      password_hash: '', // no password for SSO
      is_verified: true, // assume verified from provider
      provider: provider,
      provider_id: profile.id,
      profile_picture: profile.picture,
    });
    user = await this.userRepo.save(user);

    // Assign default role 'customer'
    const customerRole = await this.roleRepo.findOne({ where: { name: 'customer' } });
    if (customerRole) {
      const userRole = this.userRoleRepo.create({
        user,
        role: customerRole,
      });
      await this.userRoleRepo.save(userRole);
      user.roles = [userRole];
    }
  } else {
    // Update provider info if not set
    if (!user.provider) {
      user.provider = provider;
      user.provider_id = profile.id;
      user.profile_picture = profile.picture;
      await this.userRepo.save(user);
    }
  }

  // Now login
  return this.login(user, userAgent, ip, false);
}

async verifyGoogleToken(token: string) {
  try {
    const response = await firstValueFrom(
      this.httpService.get(`https://oauth2.googleapis.com/tokeninfo?id_token=${token}`)
    );
    const data = response.data;
    return {
      id: data.sub,
      email: data.email,
      name: data.name,
      picture: data.picture,
    };
  } catch (error) {
    throw new UnauthorizedException('Invalid Google token');
  }
}

async verifyGoogleTokenUnsafe(token: string) {
  // ⚠️  INSECURE: Only decode JWT without verification
  // Use only for development/testing - never in production!
  try {
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('Invalid JWT');
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    return {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      picture: payload.picture,
    };
  } catch (error) {
    throw new UnauthorizedException('Invalid Google token');
  }
}

async verifyFacebookToken(token: string) {
  try {
    // First get app token or use debug_token
    const appId = process.env.FACEBOOK_APP_ID;
    const appSecret = process.env.FACEBOOK_APP_SECRET;
    const appTokenResponse = await firstValueFrom(
      this.httpService.get(`https://graph.facebook.com/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&grant_type=client_credentials`)
    );
    const appToken = appTokenResponse.data.access_token;

    const debugResponse = await firstValueFrom(
      this.httpService.get(`https://graph.facebook.com/debug_token?input_token=${token}&access_token=${appToken}`)
    );
    if (!debugResponse.data.data.is_valid) {
      throw new UnauthorizedException('Invalid Facebook token');
    }

    const userResponse = await firstValueFrom(
      this.httpService.get(`https://graph.facebook.com/me?fields=id,email,name,picture&access_token=${token}`)
    );
    const data = userResponse.data;
    return {
      id: data.id,
      email: data.email,
      name: data.name,
      picture: data.picture?.data?.url,
    };
  } catch (error) {
    throw new UnauthorizedException('Invalid Facebook token');
  }
}

async verifyFacebookTokenUnsafe(token: string) {
  // ⚠️  INSECURE: Decode JWT without verification
  // Use only for development/testing - never in production!
  try {
    const response = await firstValueFrom(
      this.httpService.get(`https://graph.facebook.com/me?fields=id,email,name,picture&access_token=${token}`)
    );
    const data = response.data;
    return {
      id: data.id,
      email: data.email,
      name: data.name,
      picture: data.picture?.data?.url,
    };
  } catch (error) {
    throw new UnauthorizedException('Invalid Facebook token');
  }
}

async ssoLoginFromPassport(passportUser: any, provider: string, userAgent: string, ip: string) {
  // passportUser is the profile from strategy
  const profile = {
    id: passportUser.providerId,
    email: passportUser.email,
    name: `${passportUser.firstName} ${passportUser.lastName}`,
    picture: passportUser.picture,
  };

  // Find or create user
  let user = await this.userRepo.findOne({
    where: [
      { email: profile.email },
      { provider: provider, provider_id: profile.id },
    ],
    relations: ['roles'],
  });

  if (!user) {
    user = this.userRepo.create({
      email: profile.email,
      username: profile.email.split('@')[0],
      password_hash: '',
      is_verified: true,
      provider: provider,
      provider_id: profile.id,
      profile_picture: profile.picture,
    });
    user = await this.userRepo.save(user);

    // Assign customer role
    const customerRole = await this.roleRepo.findOne({ where: { name: 'customer' } });
    if (customerRole) {
      const userRole = this.userRoleRepo.create({
        user,
        role: customerRole,
      });
      await this.userRoleRepo.save(userRole);
      user.roles = [userRole];
    }
  } else {
    if (!user.provider) {
      user.provider = provider;
      user.provider_id = profile.id;
      user.profile_picture = profile.picture;
      await this.userRepo.save(user);
    }
  }

  return this.login(user, userAgent, ip, false);
}

async getUserById(userId: string) {
  const user = await this.userRepo.findOne({
    where: { user_id: userId },
    relations: ['roles'],
  });
  if (!user) throw new NotFoundException('User not found');
  return {
    user_id: user.user_id,
    email: user.email,
    username: user.username,
    phone: user.phone,
    is_verified: user.is_verified,
    roles: user.roles?.map(ur => ur.role?.name).filter(Boolean),
  };
}


async refresh(dto: RefreshTokenDto) {
  const presented = dto.refreshToken;
  let payload: any;
  try {
    payload = this.jwtService.verify(presented, { secret: process.env.JWT_SECRET });
  } catch (err) {
    throw new UnauthorizedException('Invalid or expired refresh token');
  }

  const tid = payload?.tid;
  if (!tid) throw new UnauthorizedException('Invalid refresh token (no tid)');

  // load token record by id (include user)
  const stored = await this.tokenRepo.findOne({
    where: { id: tid },
    relations: ['user'],
  });
  if (!stored) throw new UnauthorizedException('Refresh token not found');

  // check revoked / expired
  if (stored.revoked) {
    // revoke all user tokens as an aggressive response (optional)
    await this.tokenRepo.update({ user: { user_id: stored.user.user_id } }, { revoked: true });
    throw new UnauthorizedException('Refresh token revoked');
  }
  if (stored.expires_at && stored.expires_at < new Date()) {
    throw new UnauthorizedException('Refresh token expired');
  }

  // compare presented token hash with stored hash
  const valid = await bcrypt.compare(presented, stored.token_hash);
  if (!valid) {
    // possible theft — revoke all user's tokens and raise
    await this.tokenRepo.update({ user: { user_id: stored.user.user_id } }, { revoked: true });
    // optionally emit audit/kafka event here
    throw new UnauthorizedException('Invalid refresh token (possible theft). All sessions revoked.');
  }

  // ROTATE:
  // mark old as revoked
  stored.revoked = true;
  await this.tokenRepo.save(stored);

  // compute original lifetime ms (so remember state persists)
  const originalLifetimeMs = stored.expires_at && stored.created_at
    ? stored.expires_at.getTime() - stored.created_at.getTime()
    : Number(process.env.JWT_REFRESH_DAYS ?? 7) * 24 * 60 * 60 * 1000;

  const newExpiresAt = new Date(Date.now() + originalLifetimeMs);

  // create new token record
  const newRecord = this.tokenRepo.create({
    user: stored.user,
    token_hash: '',
    expires_at: newExpiresAt,
    revoked: false,
  } as Partial<RefreshToken>);
  const savedNew = await this.tokenRepo.save(newRecord);

  
  const newRefreshPayload = {
    sub: stored.user.user_id,
    tid: savedNew.id,
  };
  const newRefreshPlain = this.jwtService.sign(newRefreshPayload, { expiresIn: Math.ceil(originalLifetimeMs / 1000) + 's' });

  savedNew.token_hash = await bcrypt.hash(newRefreshPlain, 10);
  await this.tokenRepo.save(savedNew);

  const userWithRoles = await this.userRepo.findOne({
    where: { user_id: stored.user.user_id },
    relations: ['roles', 'roles.role', 'roles.role.rolePermissions', 'roles.role.rolePermissions.permission'],
  });
  const roles = (userWithRoles?.roles ?? []).map((ur) => ur.role?.name).filter(Boolean) as string[];
  const permissions = (userWithRoles?.roles ?? [])
    .flatMap((ur) => ur.role?.rolePermissions ?? [])
    .map((rp) => rp.permission?.name)
    .filter(Boolean) as string[];

  const accessToken = this.jwtService.sign({
    sub: stored.user.user_id,
    email: stored.user.email,
    roles: Array.from(new Set(roles)),
    permissions: Array.from(new Set(permissions)),
  }, { expiresIn: process.env.JWT_ACCESS_EXPIRES ?? '15m' });

  return {
    accessToken,
    refreshToken: newRefreshPlain,
    token_id: savedNew.id,
    expires_at: newExpiresAt,
  };
}

async revoke(refreshPlain: string) {
  const tokens = await this.tokenRepo.find();
  for (const t of tokens) {
    if (await bcrypt.compare(refreshPlain, t.token_hash)) {
      t.revoked = true;
      await this.tokenRepo.save(t);
      return { success: true };
    }
  }
  throw new UnauthorizedException('Refresh token not found');
}

async logout(userId: string, refreshPlain: string) {
  const tokens = await this.tokenRepo.find({
    where: { user: { user_id: userId }, revoked: false },
    relations: ['user'],
  });

  for (const t of tokens) {
    const match = await bcrypt.compare(refreshPlain, t.token_hash);
    if (match) {
      t.revoked = true;
      await this.tokenRepo.save(t);

      // optional audit / kafka emit
      await this.kafka.emit('identity.user.logged_out', {
        user_id: userId,
        token_id: t.id,
        revoked_at: new Date(),
      });

      return { success: true, message: 'Logged out successfully' };
    }
  }

  throw new UnauthorizedException('Refresh token not found or already revoked');
}


/** Helper: create and persist OTP record, return plain OTP (not stored) */
private async createAndSendOtp(user: User, purpose: 'registration' | 'password_reset', channel = 'email') {
  const otpPlain = OtpUtil.generateOtp();
  const otpHash = crypto.createHash('sha256').update(otpPlain).digest('hex');
  const otpExpiresAt = new Date(Date.now() + 1 * 60 * 1000); // 10 minutes

  const otpRecord = this.otpRepo.create({
    user,
    otp_hash: otpHash,
    purpose,
    channel,
    expires_at: otpExpiresAt,
    attempts: 0,
    used: false,
  } as Partial<OtpVerification>);

  await this.otpRepo.save(otpRecord);

  // send appropriate email (non-fatal)
  try {
    if (purpose === 'registration') {
      await this.mailer.sendOtpEmail(user.email, otpPlain);
    } else {
      await this.mailer.sendPasswordResetEmail(user.email, otpPlain);
    }
  } catch (err) {
    this.logger.warn('Failed to send OTP email in createAndSendOtp', err as any);
  }

  return { otpPlain, otpRecord };
}

/** Resend OTP if previous is expired or used, otherwise inform user OTP still active */
async resendOtp(email: string, purpose: 'registration' | 'password_reset' = 'registration') {
  const user = await this.userRepo.findOne({ where: { email } });
  if (!user) throw new NotFoundException('User not found');

  // fetch latest otp for this user & purpose
  const last = await this.otpRepo.findOne({
    where: { user: { user_id: user.user_id }, purpose },
    order: { created_at: 'DESC' },
  });

  // If there is a last and it's still valid and not used -> do not resend
  if (last && !last.used && last.expires_at > new Date()) {
    const remainingMs = last.expires_at.getTime() - Date.now();
    const remainingMin = Math.ceil(remainingMs / 60000);
    return { ok: false, message: `OTP still valid. Try again in ${remainingMin} minute(s)` };
  }

  // else create & send new OTP
  const { otpRecord } = await this.createAndSendOtp(user, purpose, 'email');

  // not returning plain otp - only meta
  return { ok: true, message: 'otp_sent', otp_id: otpRecord.otp_id, expires_at: otpRecord.expires_at };
}

/** Forgot password: generate password_reset OTP */
async forgotPassword(email: string) {
  const user = await this.userRepo.findOne({ where: { email } });
  if (!user) {
    // For security, don't reveal whether email exists; still return ok
    return { ok: true, message: 'otp_sent_if_user_exists' };
  }

  // similar throttling as resend - create fresh OTP only if none active
  const last = await this.otpRepo.findOne({
    where: { user: { user_id: user.user_id }, purpose: 'password_reset' },
    order: { created_at: 'DESC' },
  });

  if (last && !last.used && last.expires_at > new Date()) {
    return { ok: true, message: 'otp_already_sent' };
  }

  await this.createAndSendOtp(user, 'password_reset', 'email');
  return { ok: true, message: 'otp_sent' };
}

/** Reset password: verify OTP (purpose=password_reset), set new password, revoke refresh tokens */
async resetPassword(dto: ResetPasswordDto) {
  const user = await this.userRepo.findOne({ where: { email: dto.email } });
  if (!user) throw new BadRequestException('Invalid credentials');

  const otpHash = crypto.createHash('sha256').update(dto.otp).digest('hex');

  const record = await this.otpRepo.findOne({
    where: {
      user: { user_id: user.user_id },
      otp_hash: otpHash,
      purpose: 'password_reset',
      used: false,
    },
    order: { created_at: 'DESC' },
    relations: ['user'],
  });

  if (!record) throw new BadRequestException('Invalid or expired OTP');
  if (record.expires_at < new Date()) {
    throw new BadRequestException('OTP expired');
  }

  // mark used
  record.used = true;
  await this.otpRepo.save(record);

  // update password
  const newHash = await PasswordHashUtil.hash(dto.newPassword);
  user.password_hash = newHash;
  await this.userRepo.save(user);

  // Revoke all user's refresh tokens (best practice)
  await this.tokenRepo.update({ user: { user_id: user.user_id } }, { revoked: true });

  // emit kafka / audit
  try {
    await this.kafka.emit('identity.user.password_reset', { user_id: user.user_id, at: new Date() });
  } catch (err) {
    this.logger.warn('Failed to emit password reset event', err as any);
  }

  return { ok: true, message: 'password_reset_success' };
 }


 /**
   * Delete a single user by id only if they have the "customer" role.
   */
  async deleteUserIfCustomer(userId: string): Promise<{ user_id: string; message: string }> {
    const user = await this.userRepo.findOne({
      where: { user_id: userId },
      relations: ['roles', 'roles.role'],
    });

    if (!user) throw new NotFoundException('User not found');

    const hasCustomerRole = Array.isArray(user.roles) && user.roles.some((ur) => ur.role && ur.role.name === 'customer');
    if (!hasCustomerRole) throw new ForbiddenException('Only users with the customer role can be deleted');

    try {
      await this.userRepo.manager.transaction(async (manager) => {
        await manager.getRepository(User).delete({ user_id: userId });
      });

      this.logger?.log(`Deleted user ${userId} (customer)`);
      return { user_id: userId, message: 'user_deleted' };
    } catch (err) {
      this.logger?.error('Failed to delete user', (err as any).stack || err);
      throw new InternalServerErrorException('Failed to delete user. Please try again later.');
    }
  }


  /**
   * Delete ALL users that have the "customer" role.
   * Returns the number of deleted users.
   */
  async deleteAllCustomers(): Promise<{ deleted: number; message: string }> {
    const customerRole = await this.roleRepo.findOne({ where: { name: 'customer' } });
    if (!customerRole) return { deleted: 0, message: 'no_customer_role_found' };

    const userRoles = await this.userRoleRepo.find({ where: { role_id: customerRole.role_id } });
    const userIds = userRoles.map((ur) => ur.user_id).filter(Boolean);

    if (userIds.length === 0) return { deleted: 0, message: 'no_customers_found' };

    try {
      const deleteResult = await this.userRepo.manager.transaction(async (manager) => {
        return await manager.getRepository(User).delete(userIds);
      });

      const deleted = deleteResult.affected ?? 0;
      this.logger?.log(`Deleted ${deleted} customer(s)`);
      return { deleted, message: 'customers_deleted' };
    } catch (err) {
      this.logger?.error('Failed to delete customers', (err as any).stack || err);
      throw new InternalServerErrorException('Failed to delete customers. Please try again later.');
    }
  }

  async getCustomerGrowth(query: CustomerGrowthQueryDto): Promise<CustomerGrowthDto[]> {
    this.logger.log(`Fetching customer growth data for period: ${query.period}`);

    const days = query.period === TrendPeriod.WEEK ? 7 : query.period === TrendPeriod.QUARTER ? 90 : 30;
    const startDate = dayjs().subtract(days - 1, 'day').startOf('day');

    const dbResults = await this.userRepo
      .createQueryBuilder('user')
      .select("TO_CHAR(user.created_at, 'YYYY-MM-DD')", "date")
      .addSelect("COUNT(user.user_id)::int", "signupCount")
      .where("user.created_at >= :startDate", { startDate: startDate.toDate() })
      .groupBy('date')
      .orderBy('date', 'ASC')
      .getRawMany();

    // The database only returns days with activity. We need to fill in the gaps.
    const resultsMap = new Map<string, number>();
    for (const result of dbResults) {
      resultsMap.set(result.date, result.signupCount);
    }

    const trends: CustomerGrowthDto[] = [];
    for (let i = 0; i < days; i++) {
      const date = startDate.add(i, 'day').format('YYYY-MM-DD');
      trends.push({
        date: date,
        signupCount: resultsMap.get(date) || 0,
      });
    }

    return trends;
  }
}
