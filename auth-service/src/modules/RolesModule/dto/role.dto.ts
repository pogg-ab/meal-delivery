// import { Expose, Type } from 'class-transformer';
// import { ApiProperty } from '@nestjs/swagger';

// class RolePermissionShort {
//   @ApiProperty({ description: 'UUID of role-permission relation' })
//   @Expose()
//   role_permission_id?: string;

//   @ApiProperty({ description: 'Assigned permission id' })
//   @Expose()
//   permission_id?: string;
// }

// export class RoleDto {
//   @ApiProperty({ description: 'UUID of the role' })
//   @Expose()
//   role_id: string;

//   @ApiProperty({ description: 'Role name' })
//   @Expose()
//   name: string;

//   @ApiProperty({ description: 'Role description', nullable: true })
//   @Expose()
//   description?: string | null;

//   @ApiProperty({ description: 'List of role-permission relations', type: [RolePermissionShort] })
//   @Expose()
//   @Type(() => RolePermissionShort)
//   rolePermissions?: RolePermissionShort[];
// }

import { Expose, Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

class PermissionShort {
  @ApiProperty({ description: 'UUID of the permission' })
  @Expose()
  permission_id: string;

  @ApiProperty({ description: 'Permission name' })
  @Expose()
  name: string;

  @ApiProperty({ description: 'Permission description', nullable: true })
  @Expose()
  description?: string | null;
}

class RolePermissionShort {
  @ApiProperty({ description: 'UUID of role-permission relation' })
  @Expose()
  role_permission_id?: string;

  @ApiProperty({ description: 'Assigned permission id' })
  @Expose()
  permission_id?: string;

  // include nested permission data
  @ApiProperty({ description: 'Permission object', type: PermissionShort })
  @Expose()
  @Type(() => PermissionShort)
  permission?: PermissionShort;
}

export class RoleDto {
  @ApiProperty({ description: 'UUID of the role' })
  @Expose()
  role_id: string;

  @ApiProperty({ description: 'Role name' })
  @Expose()
  name: string;

  @ApiProperty({ description: 'Role description', nullable: true })
  @Expose()
  description?: string | null;

  @ApiProperty({ description: 'List of role-permission relations', type: [RolePermissionShort] })
  @Expose()
  @Type(() => RolePermissionShort)
  rolePermissions?: RolePermissionShort[];
}
