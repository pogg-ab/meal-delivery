
import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  Logger,
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
  
    // We'll capture OTP plain text here to send after commit (never persist plain text)
    const otpPlain = OtpUtil.generateOtp();
    const otpHash = crypto.createHash('sha256').update(otpPlain).digest('hex');
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
  
    // 3) perform DB changes inside a transaction (user, user_role, otp)
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
      // Save mapping (no duplicate check because transaction and DB constraints will prevent dupes)
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
    }); // transaction commits here or rolls back on error
  
    // 4) After commit: send OTP email and emit kafka event (non-fatal)
    try {
      await this.mailer.sendOtpEmail(savedUser.email, otpPlain);
    } catch (err) {
      this.logger?.error('Failed to send OTP email', err as any);
      // continue — do not roll back transaction for email failure
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
      // where: { email },
      // relations: ['roles', 'roles.role'],
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

// async login(user: User, deviceInfo: string, ip: string) {
//   const roles = user.roles?.map((ur) => ur.role.name) || [];

//   // Collect permissions from role -> rolePermissions -> permission
//   const permissions = user.roles
//     ?.flatMap((ur) => ur.role.rolePermissions?.map((rp) => rp.permission.name))
//     .filter((p) => !!p) || [];

//   const payload = {
//     sub: user.user_id,
//     email: user.email,
//     roles,
//     permissions,
//   };

//   const accessToken = this.jwtService.sign(payload, { expiresIn: '15m' });
//   const refreshToken = this.jwtService.sign(payload, { expiresIn: '7d' });

//   // Save refresh token in DB
//   const entity = this.tokenRepo.create({
//     user,
//     token_hash: await bcrypt.hash(refreshToken, 10),
//     expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000),
//     revoked: false,
//   });
//   await this.tokenRepo.save(entity);

//   return {
//     accessToken,
//     refreshToken,
//     roles,
//     permissions,
//   };
// }

//   async refresh(dto: RefreshTokenDto) {
//     const stored = await this.tokenRepo.findOne({
//       where: { revoked: false },
//       relations: ['user'],
//     });
//     if (!stored) throw new UnauthorizedException('Invalid refresh token');

//     const valid = await bcrypt.compare(dto.refreshToken, stored.token_hash);
//     if (!valid) throw new UnauthorizedException('Invalid refresh token');

//     const user = await this.userRepo.findOne({
//       where: { user_id: stored.user.user_id },
//       relations: ['roles', 'roles.role'],
//     });
//     if (!user) throw new UnauthorizedException('User not found');

//     return this.login(user, 'refresh', 'system');
//   }

//   async revoke(refreshPlain: string) {
//     const tokens = await this.tokenRepo.find();
//     for (const t of tokens) {
//       if (await bcrypt.compare(refreshPlain, t.token_hash)) {
//         t.revoked = true;
//         await this.tokenRepo.save(t);
//         return { success: true };
//       }
//     }
//     throw new UnauthorizedException('Refresh token not found');
//   }

// async logout(userId: string, refreshPlain: string) {
//   const tokens = await this.tokenRepo.find({
//     where: { user: { user_id: userId }, revoked: false },
//     relations: ['user'],
//   });

//   for (const t of tokens) {
//     const match = await bcrypt.compare(refreshPlain, t.token_hash);
//     if (match) {
//       t.revoked = true;
//       await this.tokenRepo.save(t);

//       // optional audit log / kafka emit
//       await this.kafka.emit('identity.user.logged_out', {
//         user_id: userId,
//         token_id: t.id,
//         revoked_at: new Date(),
//       });

//       return { success: true, message: 'Logged out successfully' };
//     }
//   }

//   throw new UnauthorizedException('Refresh token not found or already revoked');
// }
async login(user: User, deviceInfo: string, ip: string, remember = false) {
  // -- 1) Build roles & permissions (from loaded relations if present)
  const roles = (user.roles ?? []).map((ur) => ur.role?.name).filter(Boolean) as string[];
  let permissions = (user.roles ?? [])
    .flatMap((ur) => ur.role?.rolePermissions ?? [])
    .map((rp) => rp.permission?.name)
    .filter(Boolean) as string[];

  // If empty perms (just in case), fallback to DB query (robust)
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
  const accessExpiry = process.env.JWT_ACCESS_EXPIRES ?? '15m';
  const accessToken = this.jwtService.sign(payloadForAccess, { expiresIn: accessExpiry });

  // Refresh lifetime depends on remember flag
  const refreshDays = remember ? Number(process.env.JWT_REMEMBER_DAYS ?? 30) : Number(process.env.JWT_REFRESH_DAYS ?? 7);
  const refreshExpiry = `${refreshDays}d`;
  const expiresAt = new Date(Date.now() + refreshDays * 24 * 60 * 60 * 1000);

  // 2) Create DB refresh token record first (so we have an id to embed in the JWT)
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

// -------------------------
// REFRESH (rotate)
// -------------------------
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

  // sign new refresh token (include tid)
  const newRefreshPayload = {
    sub: stored.user.user_id,
    tid: savedNew.id,
  };
  const newRefreshPlain = this.jwtService.sign(newRefreshPayload, { expiresIn: Math.ceil(originalLifetimeMs / 1000) + 's' });

  // persist hash
  savedNew.token_hash = await bcrypt.hash(newRefreshPlain, 10);
  await this.tokenRepo.save(savedNew);

  // sign a new access token - include roles/permissions (load from DB if needed)
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

// -------------------------
// REVOKE & LOGOUT
// -------------------------
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
}
