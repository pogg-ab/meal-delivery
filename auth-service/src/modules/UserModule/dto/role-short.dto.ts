import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class RoleShortDto {
  @ApiProperty({ description: 'UUID of the role' })
  @Expose()
  role_id: string;

  @ApiProperty({ description: 'Role name' })
  @Expose()
  name: string;
}
