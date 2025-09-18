
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSION_KEY, TENANT_OWNER_ONLY_KEY, SUPER_ADMIN_ONLY_KEY } from '../decorators/require-permission.decorator';
import { TENANT_REQUIRED_KEY, RequireTenantMeta } from '../decorators/require-tenant.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const handler = context.getHandler();
    const classRef = context.getClass();

    // permission required metadata
    const required = this.reflector.getAllAndOverride<string>(PERMISSION_KEY, [handler, classRef]);

    // tenant metadata (may be undefined)
    const tenantMeta = this.reflector.getAllAndOverride<RequireTenantMeta>(TENANT_REQUIRED_KEY, [handler, classRef]);

    // Check if route is restricted to tenant owners only
    const tenantOwnerOnly = this.reflector.getAllAndOverride<boolean>(TENANT_OWNER_ONLY_KEY, [handler, classRef]);

    // Check if route is restricted to super admins only
    const superAdminOnly = this.reflector.getAllAndOverride<boolean>(SUPER_ADMIN_ONLY_KEY, [handler, classRef]);

    // If no permission required, allow (other guards might run)
    if (!required) {
      // still optionally enforce tenant if decorator was placed without permission (rare)
      if (!tenantMeta) return true;
    }

    const req = context.switchToHttp().getRequest();
    const user = req.user;

    if (!user) {
      throw new ForbiddenException('Unauthenticated');
    }

    // Check if route is super admin only
    if (superAdminOnly) {
      if (!user?.isSuperAdmin && !user?.is_super_admin) {
        throw new ForbiddenException('This route is restricted to super admins only');
      }
      // set tenantId context for downstream convenience (super-admin has no tenant)
      req.tenantId = null;
      return true;
    }

    // super-admin bypass (accept common field names) - but not for tenant-owner-only routes
    if (user?.isSuperAdmin || user?.is_super_admin) {
      // If route is restricted to tenant owners only, deny super admin access
      if (tenantOwnerOnly) {
        throw new ForbiddenException('This route is restricted to tenant owners only');
      }
      // set tenantId context for downstream convenience (super-admin has no tenant)
      req.tenantId = null;
      return true;
    }

    // determine paramName and strictness
    const paramName = tenantMeta?.paramName ?? 'tid';
    const strict = tenantMeta?.strict ?? false;

    // locate tid in params/body/query/header
    const tidCandidates = [
      req.params?.[paramName],
      req.body?.[paramName],
      req.query?.[paramName],
      req.headers?.['x-tenant-id'],
      req.headers?.['x_tenant_id'],
    ];
    console.log(tidCandidates)
    // first defined non-empty candidate
    const tidRaw = tidCandidates.find((v) => v !== undefined && v !== null);

    const tid = tidRaw !== undefined ? Number(tidRaw) : undefined;

    if (tenantMeta) {
      // route explicitly requires tenant context
      if (tid === undefined || Number.isNaN(tid)) {
        // fallback to user's tenant only if not strict
        if (!strict && user.tenantId) {
          req.tenantId = Number(user.tenantId);
        } else {
          throw new BadRequestException(`Tenant id required (param '${paramName}')`);
        }
      } else {
        // ensure user belongs to requested tenant
        if (!user.tenantId || Number(user.tenantId) !== tid) {
          throw new ForbiddenException('You do not belong to this tenant');
        }
        req.tenantId = tid;
      }
    } else {
      // tenant not explicitly required:
      if (typeof tid === 'number' && !Number.isNaN(tid)) {
        // if tid provided, enforce it
        if (!user.tenantId || Number(user.tenantId) !== tid) {
          throw new ForbiddenException('You do not belong to this tenant');
        }
        req.tenantId = tid;
      } else {
        // no tid provided; lenient behavior — set tenantId to user's tenant if exists
        if (user.tenantId) req.tenantId = Number(user.tenantId);
      }
    }

    // For tenant-owner-only routes, ensure user has a valid tenant context
    if (tenantOwnerOnly && !req.tenantId) {
      throw new ForbiddenException('Tenant context required for this route');
    }

    // Permission check
    const normalizedPerms = (user?.perms || []).map((p: string) => String(p).toLowerCase());
    if (required && !normalizedPerms.includes(required.toLowerCase())) {
      throw new ForbiddenException(`Missing permission: ${required}`);
    }

    return true;
  }
}

