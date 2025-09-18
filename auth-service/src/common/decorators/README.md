# Permission Decorators

This directory contains decorators for controlling access to routes in the ERP system.

## Available Decorators

### `@RequirePermission(resource:action)`
Requires a specific permission to access the route. Can be used by both super admins and tenant users.

**Example:**
```typescript
@RequirePermission('users:read')
@Get()
findAll() {
  return this.userService.findAll();
}
```

### `@TenantOwnerOnly()`
Restricts access to tenant owners only. Super admins will be denied access to routes marked with this decorator.

**Example:**
```typescript
@TenantOwnerOnly()
@RequirePermission('users:create')
@Post()
createUser(@Body() dto: CreateUserDto) {
  return this.userService.create(dto);
}
```

### `@SuperAdminOnly()`
Restricts access to super admins only. Tenant users will be denied access to routes marked with this decorator.

**Example:**
```typescript
@SuperAdminOnly()
@RequirePermission('system:configure')
@Post('system/config')
configureSystem(@Body() config: any) {
  return this.systemService.configure(config);
}
```

### `@RequireTenant(paramName?, options?)`
Requires a tenant context for the route. Can be combined with other decorators.

**Example:**
```typescript
@RequireTenant('tid', { strict: true })
@RequirePermission('users:read')
@Get()
findAll() {
  return this.userService.findAll();
}
```

## Usage Patterns

### Route accessible to everyone with permission (including super admins)
```typescript
@RequirePermission('users:read')
@Get()
findAll() {
  return this.userService.findAll();
}
```

### Route accessible only to tenant owners (not super admins)
```typescript
@TenantOwnerOnly()
@RequirePermission('users:create')
@Post()
createUser(@Body() dto: CreateUserDto) {
  return this.userService.create(dto);
}
```

### Route accessible only to super admins (not tenant users)
```typescript
@SuperAdminOnly()
@RequirePermission('system:configure')
@Post('system/config')
configureSystem(@Body() config: any) {
  return this.systemService.configure(config);
}
```

### Route that requires tenant context and specific permission
```typescript
@RequireTenant('tid')
@RequirePermission('users:update')
@Patch(':tid')
updateUser(@Param('tid') tid: number, @Body() dto: UpdateUserDto) {
  return this.userService.update(tid, dto);
}
```

## Important Notes

1. **Super Admin Bypass**: By default, super admins bypass permission checks, but they cannot access routes marked with `@TenantOwnerOnly()`.

2. **Tenant Context**: Routes marked with `@TenantOwnerOnly()` automatically require a valid tenant context.

3. **Super Admin Only**: Routes marked with `@SuperAdminOnly()` are accessible only to super admins, regardless of permissions.

4. **Mutual Exclusivity**: `@TenantOwnerOnly()` and `@SuperAdminOnly()` are mutually exclusive - use only one per route.

5. **Combination**: You can combine these decorators with `@RequirePermission` and `@RequireTenant` for fine-grained access control.

6. **Order Matters**: Place `@TenantOwnerOnly()` or `@SuperAdminOnly()` before `@RequirePermission()` for clarity.
