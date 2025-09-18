import { SetMetadata } from '@nestjs/common';

export const PERMISSION_KEY = 'requiredPermission';
export const TENANT_OWNER_ONLY_KEY = 'tenantOwnerOnly';
export const SUPER_ADMIN_ONLY_KEY = 'superAdminOnly';

export const RequirePermission = (resourceOrCombined: string, maybeAction?: string) => {
  let key: string;
  if (maybeAction) {
    key = `${resourceOrCombined}:${maybeAction}`;
  } else {
    key = resourceOrCombined;
  }
  return SetMetadata(PERMISSION_KEY, key.toLowerCase());
};

export const TenantOwnerOnly = () => SetMetadata(TENANT_OWNER_ONLY_KEY, true);

export const SuperAdminOnly = () => SetMetadata(SUPER_ADMIN_ONLY_KEY, true);
