import { SetMetadata } from '@nestjs/common';

export type RequireTenantMeta = { paramName: string; strict: boolean };

/**
 * Mark a route/controller as tenant-scoped.
 *
 * @param paramName - request param/query/body key that carries tenant id (default: 'tid')
 * @param options.strict - if true, the guard will reject requests that do not provide a valid tid (no fallback to user's tenant)
 *
 * Usage:
 *  @RequireTenant()                    // defaults to param 'tid', lenient fallback to user's tenantId
 *  @RequireTenant('tid', { strict: true })  // require tid present and valid (no fallback)
 */
export const TENANT_REQUIRED_KEY = 'requireTenant';
export const RequireTenant = (paramName = 'tid', options?: { strict?: boolean }) =>
  SetMetadata(TENANT_REQUIRED_KEY, { paramName, strict: !!options?.strict } as RequireTenantMeta);
