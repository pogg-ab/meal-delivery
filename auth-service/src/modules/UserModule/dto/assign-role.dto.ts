import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AssignRoleDto {
  @ApiProperty({ description: 'Role id to assign', example: '11111111-1111-1111-1111-111111111111' })
  @IsUUID('4')
  roleId: string;
}
