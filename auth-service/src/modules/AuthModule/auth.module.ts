import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { HttpModule } from '@nestjs/axios';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { GoogleStrategy } from './strategies/google.strategy';
import { FacebookStrategy } from './strategies/facebook.strategy';
import { User } from '../../entities/User.entity';
import { RefreshToken } from '../../entities/Refresh-token.entity';
import { OtpVerification } from '../../entities/Otp-verification.entity';
import { RolesModule } from '../RolesModule/roles.module';
import { KafkaProvider } from '../../providers/kafka.provider';
import { MailerProvider } from '../../providers/mailer.provider';
import { Role } from '../../entities/Role.entity';
import { UserRole } from '../../entities/User-role.entity';
import { UsersModule } from '../UserModule/user.module';


@Module({
    imports: [
        UsersModule,
        TypeOrmModule.forFeature([User, RefreshToken, OtpVerification, Role, UserRole]),
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({
            secret: process.env.JWT_SECRET || 'supersecret',
            signOptions: { expiresIn: process.env.JWT_EXPIRES_IN || '15m' },
        }),
        RolesModule,
        HttpModule,
    ],
    providers: [AuthService, JwtStrategy, GoogleStrategy, FacebookStrategy, KafkaProvider, MailerProvider],
    controllers: [AuthController],
    exports: [AuthService],
})
export class AuthModule { }