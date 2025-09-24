// src/roles/dto/assign-permissions.dto.ts
// src/roles/dto/assign-permissions.dto.ts
import { IsArray, ArrayNotEmpty, ArrayUnique, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AssignPermissionsDto {
  @ApiProperty({
    description: 'Array of permission UUIDs to assign to the role',
    type: [String],
    example: ['11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222'],
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  permissionIds: string[];
}

