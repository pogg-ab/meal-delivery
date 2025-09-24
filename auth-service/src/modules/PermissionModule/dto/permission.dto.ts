import { Expose } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class PermissionDto {
  @ApiProperty({ description: 'UUID of permission' })
  @Expose()
  permission_id: string;

  @ApiProperty({ description: 'Permission name' })
  @Expose()
  name: string;

  @ApiProperty({ description: 'Permission description', nullable: true })
  @Expose()
  description?: string | null;
}
