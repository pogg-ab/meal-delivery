// Example usage of the @TenantOwnerOnly decorator
// This file demonstrates how to restrict routes to tenant owners only

import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { RequirePermission, TenantOwnerOnly, SuperAdminOnly } from './require-permission.decorator';
import { RequireTenant } from './require-tenant.decorator';
import { PermissionsGuard } from '../guards/permissions.guard';

@Controller('example')
@UseGuards(PermissionsGuard)
export class ExampleController {

  // Route accessible to everyone with permission (including super admins)
  @RequirePermission('users:read')
  @Get()
  findAll() {
    return 'This route is accessible to super admins and tenant users with permission';
  }

  // Route accessible only to tenant owners (NOT super admins)
  @TenantOwnerOnly()
  @RequirePermission('users:create')
  @Post()
  createUser(@Body() dto: any) {
    return 'This route is accessible ONLY to tenant owners with permission';
  }

  // Route that requires tenant context and specific permission
  @RequireTenant('tid')
  @RequirePermission('users:update')
  @Patch(':tid')
  updateUser(@Param('tid') tid: number, @Body() dto: any) {
    return 'This route requires tenant context and permission';
  }

  // Route accessible only to tenant owners with tenant context
  @TenantOwnerOnly()
  @RequireTenant('tid')
  @RequirePermission('users:delete')
  @Delete(':tid')
  deleteUser(@Param('tid') tid: number) {
    return 'This route is accessible ONLY to tenant owners with tenant context';
  }

  // Route accessible only to super admins
  @SuperAdminOnly()
  @RequirePermission('system:configure')
  @Post('system/config')
  configureSystem(@Body() config: any) {
    return 'This route is accessible ONLY to super admins';
  }
}

/*
Key Points:

1. @TenantOwnerOnly() - Restricts access to tenant owners only
2. @SuperAdminOnly() - Restricts access to super admins only
3. Super admins will be denied access to routes with @TenantOwnerOnly()
4. Tenant users will be denied access to routes with @SuperAdminOnly()
5. Can be combined with @RequirePermission and @RequireTenant
6. Automatically ensures tenant context is available for @TenantOwnerOnly()
7. Place @TenantOwnerOnly() or @SuperAdminOnly() before other decorators for clarity

Usage Scenarios:
- @TenantOwnerOnly():
  - Tenant-specific configuration routes
  - User management within a tenant
  - Tenant billing/payment routes
  - Any route that should be restricted to tenant owners only

- @SuperAdminOnly():
  - System-wide configuration routes
  - Global user management
  - System monitoring and maintenance
  - Any route that should be restricted to super admins only
*/
