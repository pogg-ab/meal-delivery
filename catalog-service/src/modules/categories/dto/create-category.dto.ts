import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID, IsOptional } from 'class-validator';

export class CreateCategoryDto {
  @ApiProperty({ 
    description: 'The ID of the restaurant this category belongs to',
    example: 'f21132d1-3750-4686-af9a-76856d1ec80c' // Example UUID
  })
  @IsUUID()
  @IsNotEmpty()
  restaurant_id: string;

  @ApiProperty({ example: 'Main Courses' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'Our signature and most popular dishes.', required: false })
  @IsOptional()
  @IsString()
  description?: string;
}