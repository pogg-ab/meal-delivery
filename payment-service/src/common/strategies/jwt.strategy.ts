import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

interface JwtPayload {
  sub: string;
  email: string;
  roles?: string[];
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly configService: ConfigService) {
    const accessSecret = configService.get<string>('JWT_ACCESS_SECRET');
    const nodeEnv = configService.get<string>('NODE_ENV', 'development');

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: accessSecret || 'insecure-dev-secret',
      issuer: configService.get<string>('JWT_ISSUER') || 'auth-service',
      audience: configService.get<string>('JWT_AUDIENCE') || 'api-clients',
    });

    if (!accessSecret && nodeEnv === 'production') {
      throw new Error('JWT_ACCESS_SECRET is required');
    }
  }

  async validate(payload: JwtPayload) {
    return {
      userId: payload.sub,
      email: payload.email,
      roles: payload.roles || [],
    };
  }
}
