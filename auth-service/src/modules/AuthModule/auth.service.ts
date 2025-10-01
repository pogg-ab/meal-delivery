
import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  Logger,
  NotFoundException,
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
    
  ) {}

  async register(dto: RegisterDto) {
    // 1) quick uniqueness check
    const existing = await this.userRepo.findOne({
      where: [{ email: dto.email }, { username: dto.username }],
    });
    if (existing) {
      throw new BadRequestException('Email or username already in use');
    }
  
    // 2) hash password
    const hash = await PasswordHashUtil.hash(dto.password);
  
    const otpPlain = OtpUtil.generateOtp();
    const otpHash = crypto.createHash('sha256').update(otpPlain).digest('hex');
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
  
    const { savedUser } = await this.userRepo.manager.transaction(async (manager) => {
      const uRepo = manager.getRepository(User);
      const rRepo = manager.getRepository(Role);
      const urRepo = manager.getRepository(UserRole);
      const oRepo = manager.getRepository(this.otpRepo.metadata.target as any); // or manager.getRepository(OtpEntity)
  
      // create user
      const user = uRepo.create({
        username: dto.username,
        email: dto.email,
        password_hash: hash,
        phone: dto.phone,
        is_verified: false,
      });
      const saved = await uRepo.save(user);
  
      // ensure customer role exists (create if missing)
      let customerRole = await rRepo.findOne({ where: { name: 'customer' } });
      if (!customerRole) {
        customerRole = rRepo.create({
          name: 'customer',
          description: 'Default customer role',
        } as Partial<Role>);
        customerRole = await rRepo.save(customerRole);
      }
      // assign role (user_roles)
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

  const payloadForAccess = {
    sub: user.user_id,
    email: user.email,
    roles: uniqueRoles,
    permissions: uniquePermissions,
  };

  // Access token (short-lived)
  const accessExpiry = process.env.JWT_ACCESS_EXPIRES ?? '1h';
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

  // return tokens + meta
  return {
    accessToken,
    refreshToken: refreshTokenPlain,
    roles: uniqueRoles,
    permissions: uniquePermissions,
    token_id: savedToken.id,
    expires_at: expiresAt,
    remember,
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
  const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

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

}
