// auth-service/src/modules/restaurants/dto/update-restaurant.dto.ts

import { IsString, IsOptional, IsEmail, IsPhoneNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateRestaurantDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ required: false, example: '+251911123456' })
  @IsOptional()
  @IsPhoneNumber('ET')
  phone?: string;

  // The bank_details property has been REMOVED from this DTO.
}