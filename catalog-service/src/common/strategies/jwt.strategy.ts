// in catalog-service/src/common/strategies/jwt.strategy.ts

// import { Injectable } from '@nestjs/common';
// import { PassportStrategy } from '@nestjs/passport';
// import { Strategy, ExtractJwt } from 'passport-jwt';
// import { ConfigService } from '@nestjs/config';

// interface JwtPayload {
//   sub: string;
//   email: string;
//   roles?: string[];
// }

// @Injectable()
// export class JwtStrategy extends PassportStrategy(Strategy) {
//   constructor(
//     private readonly configService: ConfigService
//   ) {
//     const jwtSecret = configService.get<string>('JWT_SECRET', 'default_jwt_secret');
//     if (!jwtSecret) {
//       throw new Error('JWT_SECRET is not defined in environment variables');
//     }
//     super({
//       jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
//       ignoreExpiration: false,
//       secretOrKey: jwtSecret,
//     });
//   }

//   async validate(payload: JwtPayload) {
//     // This attaches the payload to the request object as `req.user`
//     return {
//       userId: payload.sub,
//       email: payload.email,
//       roles: payload.roles || [],
//     };
//   }
// }


import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt } from 'passport-jwt';

interface JwtPayload {
  sub: string;
  email: string;
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
      roles: payload.roles || [],
      permissions: payload.permissions || [],
      restaurantId: payload.restaurant_id || null,
    };
  }
}
