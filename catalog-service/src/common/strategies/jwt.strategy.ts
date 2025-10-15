
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt } from 'passport-jwt';

interface JwtPayload {
  sub: string;
  email: string;
  username: string;
  phone: string;
  roles?: string[];
  permissions?: string[];
  restaurant_id?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'supersecret',
    });
  }

  async validate(payload: JwtPayload) {
    // Attach clean user info to req.user
    return {
      userId: payload.sub,
      email: payload.email,
      username:payload.username,
      phone: payload.phone,
      roles: payload.roles || [],
      permissions: payload.permissions || [],
      restaurantId: payload.restaurant_id || null,
    };
  }
}
