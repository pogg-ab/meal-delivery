import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsEmail,
  IsPhoneNumber,
  IsArray,
  ValidateNested,
  IsInt,
  Min,
  Max,
  IsMilitaryTime,
  IsBoolean,
  IsOptional,
} from 'class-validator';
import { Type } from 'class-transformer';

class AddressDto {
  @ApiProperty({ example: '123 Africa Avenue', description: "The restaurant's street address" })
  @IsString()
  @IsNotEmpty()
  street: string;

  @ApiProperty({ example: 'Addis Ababa' })
  @IsString()
  @IsNotEmpty()
  city: string;

  @ApiProperty({ example: 'Addis Ababa' })
  @IsString()
  @IsNotEmpty()
  region: string;
  
  @ApiProperty({ example: 'Main Branch' })
  @IsString()
  @IsNotEmpty()
  label: string;
}

class RestaurantHourDto {
  @ApiProperty({ example: 1, description: 'Day of the week (0=Sunday, 1=Monday, ..., 6=Saturday)' })
  @IsInt()
  @Min(0)
  @Max(6)
  weekday: number;

  @ApiProperty({ example: '08:00', description: 'Opening time in HH:MM format' })
  @IsMilitaryTime()
  open_time: string;

  @ApiProperty({ example: '22:00', description: 'Closing time in HH:MM format' })
  @IsMilitaryTime()
  close_time: string;

  @ApiProperty({ example: false, description: 'Set to true if the restaurant is closed on this day', required: false })
  @IsBoolean()
  @IsOptional()
  is_closed?: boolean;
}

export class RegisterRestaurantDto {
  @ApiProperty({ example: 'Sheger Gebeta Traditional Foods' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'Authentic Ethiopian cuisine, serving the best Tibs and Doro Wat.' })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({ example: 'contact@shegergebeta.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: '+251911123456' })
  @IsPhoneNumber('ET')
  phone: string;

  @ApiProperty({ type: AddressDto })
  @ValidateNested()
  @Type(() => AddressDto)
  address: AddressDto;

  @ApiProperty({ type: [RestaurantHourDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RestaurantHourDto)
  hours: RestaurantHourDto[];
}