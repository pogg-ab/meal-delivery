import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Observable } from 'rxjs';

@Injectable()
export class InternalAuthGuard implements CanActivate {
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest();
    const headerKey = request.headers['x-internal-api-key'];

    const expectedKey = process.env.INTERNAL_API_KEY;

    if (!expectedKey) {
        // This is a server configuration error
        throw new Error('INTERNAL_API_KEY is not set in the environment.');
    }

    if (headerKey === expectedKey) {
      return true;
    } else {
      throw new UnauthorizedException('Invalid or missing internal API key.');
    }
  }
}