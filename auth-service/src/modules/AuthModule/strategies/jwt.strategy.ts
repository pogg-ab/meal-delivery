// import { Injectable } from '@nestjs/common';
// import { PassportStrategy } from '@nestjs/passport';
// import { Strategy, ExtractJwt } from 'passport-jwt';


// @Injectable()
// export class JwtStrategy extends PassportStrategy(Strategy) {
// constructor() {
// super({
// jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
// ignoreExpiration: false,
// secretOrKey: process.env.JWT_SECRET || 'supersecret',
// });
// }


// async validate(payload: any) {
// // payload contains sub, email, roles, permissions
// // return payload so it's attached to req.user
// return payload;
// }
// }

import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt } from 'passport-jwt';

interface JwtPayload {
  sub: string;
  email: string;
  roles?: string[];
  permissions?: string[];
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
    };
  }
}
