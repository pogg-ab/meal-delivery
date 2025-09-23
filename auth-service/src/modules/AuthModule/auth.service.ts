
import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(RefreshToken)
    private readonly tokenRepo: Repository<RefreshToken>,
    @InjectRepository(OtpVerification)
    private readonly otpRepo: Repository<OtpVerification>,
    private readonly jwtService: JwtService,
    private readonly mailer: MailerProvider,
    private readonly kafka: KafkaProvider,
    private readonly rolesService: RolesService,
  ) {}

  /** =========================
   *   Registration + OTP
   *  ========================= */
  async register(dto: RegisterDto) {
    const existing = await this.userRepo.findOne({
      where: [{ email: dto.email }, { username: dto.username }],
    });
    if (existing) {
      throw new BadRequestException('Email or username already in use');
    }

    const hash = await PasswordHashUtil.hash(dto.password);
    const user = this.userRepo.create({
      username: dto.username,
      email: dto.email,
      password_hash: hash,
      phone: dto.phone,
      is_verified: false,
    });
    const saved = await this.userRepo.save(user);

    // generate OTP and store hashed
    const otpPlain = OtpUtil.generateOtp();
    const otpHash = crypto.createHash('sha256').update(otpPlain).digest('hex');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    const otpRecord = this.otpRepo.create({
      user: saved,
      otp_hash: otpHash,
      purpose: 'registration',
      channel: 'email',
      expires_at: expiresAt,
    });
    await this.otpRepo.save(otpRecord);

    // send email
    try {
    //   await this.mailer.sendMail(
    //     saved.email,
    //     'Verify your account',
    //     `Your OTP code is ${otpPlain}. It expires in 10 minutes.`,
    //   );
     await this.mailer.sendOtpEmail(saved.email, otpPlain);
    } catch (err) {
      this.logger.error('Failed to send OTP email', err as any);
    }

    await this.kafka.emit('identity.user.registered', {
      user_id: saved.user_id,
      email: saved.email,
      created_at: saved.created_at,
    });
    return { user_id: saved.user_id, message: 'verification_sent' };
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

  /** =========================
   *   Auth Flow
   *  ========================= */
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


async login(user: User, deviceInfo: string, ip: string) {
  const roles = user.roles?.map((ur) => ur.role.name) || [];

  // Collect permissions from role -> rolePermissions -> permission
  const permissions = user.roles
    ?.flatMap((ur) => ur.role.rolePermissions?.map((rp) => rp.permission.name))
    .filter((p) => !!p) || [];

  const payload = {
    sub: user.user_id,
    email: user.email,
    roles,
    permissions,
  };

  const accessToken = this.jwtService.sign(payload, { expiresIn: '15m' });
  const refreshToken = this.jwtService.sign(payload, { expiresIn: '7d' });

  // Save refresh token in DB
  const entity = this.tokenRepo.create({
    user,
    token_hash: await bcrypt.hash(refreshToken, 10),
    expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    revoked: false,
  });
  await this.tokenRepo.save(entity);

  return {
    accessToken,
    refreshToken,
    roles,
    permissions,
  };
}


  async refresh(dto: RefreshTokenDto) {
    const stored = await this.tokenRepo.findOne({
      where: { revoked: false },
      relations: ['user'],
    });
    if (!stored) throw new UnauthorizedException('Invalid refresh token');

    const valid = await bcrypt.compare(dto.refreshToken, stored.token_hash);
    if (!valid) throw new UnauthorizedException('Invalid refresh token');

    const user = await this.userRepo.findOne({
      where: { user_id: stored.user.user_id },
      relations: ['roles', 'roles.role'],
    });
    if (!user) throw new UnauthorizedException('User not found');

    return this.login(user, 'refresh', 'system');
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

      // optional audit log / kafka emit
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
