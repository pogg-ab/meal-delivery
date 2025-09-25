import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

export class UpdateCategoryDto {
  @ApiProperty({ example: 'Updated Main Courses', required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ example: 'Our finest and most popular dishes.', required: false })
  @IsOptional()
  @IsString()
  description?: string;
}