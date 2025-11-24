import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsLatitude,
  IsLongitude,
} from 'class-validator';

export class UpdateAddressDto {
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

  @ApiProperty({ example: 9.006000, description: 'The latitude of the restaurant location' })
  @IsLatitude()
  latitude: number;

  @ApiProperty({ example: 38.764000, description: 'The longitude of the restaurant location' })
  @IsLongitude()
  longitude: number;
}