// import { Injectable, UnauthorizedException } from '@nestjs/common';
// import { PassportStrategy } from '@nestjs/passport';
// import { Strategy, ExtractJwt } from 'passport-jwt';
// import { jwtConstants } from '../modules/auth/constants';
// import { AuthService } from '../modules/auth/auth.service';

// @Injectable()
// export class JwtStrategy extends PassportStrategy(Strategy) {
//   constructor(private authService: AuthService) {
//     super({ jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(), ignoreExpiration: false, secretOrKey: jwtConstants.secret, });
//   }
//   async validate(payload: any) {
//     const user = await this.authService.validateUserById(payload.sub);
//     if (!user) throw new UnauthorizedException();
//     return user;
//   }
// }

// src/modules/auth/jwt.strategy.ts

// import { Injectable, UnauthorizedException } from '@nestjs/common';
// import { PassportStrategy }            from '@nestjs/passport';
// import { ExtractJwt, Strategy }        from 'passport-jwt';
// import { ConfigService }               from '@nestjs/config';
// import { AuthService }                 from '../modules/auth/auth.service';

// @Injectable()
// export class JwtStrategy extends PassportStrategy(Strategy) {
//   constructor(
//     private readonly authService: AuthService,
//     cs: ConfigService,
//   ) {
//     super({
//       jwtFromRequest:  ExtractJwt.fromAuthHeaderAsBearerToken(),
//       secretOrKey:     cs.get<string>('JWT_SECRET'),
//       ignoreExpiration:false,
//     });
//   }

//   async validate(payload: any) {
//     // payload.sub = userId, payload.tid = tenantId, payload.perms = [...]
//     const user = await this.authService.validateUserById(payload.sub);
//     if (!user) throw new UnauthorizedException();
//     // you can attach tenantId and perms to the Request user object here:
//     return {
//       id:       user.id,
//       email:    user.email,
//       tenantId: payload.tid,
//       perms:    payload.perms,
//       full_name: user.full_name,
//       isSuperAdmin: user.is_super_admin,
//     };
//   }
// }


import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(cs: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: cs.get<string>('JWT_SECRET'),
      ignoreExpiration: false,
    });
  }

  async validate(payload: any) {
    if (!payload?.sub) {
      throw new UnauthorizedException();
    }

    console.log('payload:', payload);

    // Just trust the claims from JWT
    return {
      id: payload.sub,
      email: payload.email,
      tenantId: payload.tid,
      perms: payload.perms,
      full_name: payload.full_name,
      isSuperAdmin: payload.isSuperAdmin,
    };
  }
}
