import { IsString, IsNotEmpty, MaxLength, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePermissionDto {
  @ApiProperty({ description: 'Unique permission name', maxLength: 100, example: 'permissions.manage' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ description: 'Optional human friendly description', example: 'Allows managing permissions' })
  @IsOptional()
  @IsString()
  description?: string | null;
}
