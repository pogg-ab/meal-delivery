// auth-service/src/modules/restaurants/dto/update-restaurant.dto.ts

import { IsString, IsOptional, IsEmail, IsPhoneNumber, ValidateNested } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

class BankDetailsDto {
  @ApiProperty()
  @IsString()
  account_name: string;

  @ApiProperty()
  @IsString()
  account_number: string;

  @ApiProperty()
  @IsString()
  bank_name: string;
}

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

  @ApiProperty({ required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => BankDetailsDto)
  bank_details?: BankDetailsDto;
}