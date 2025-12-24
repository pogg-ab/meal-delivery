
import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, Length, MinLength } from 'class-validator';

export class UpdateProfileDto {
  @ApiProperty({
    description: 'The user full name or display name',
    example: 'John Doe',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MinLength(3)
  username?: string;

  @ApiProperty({
    description: 'The user phone number',
    example: '+15551234567',
    required: false,
  })
  @IsOptional()
  @IsString()
  @Length(10, 15) // Basic length validation for phone numbers
  phone?: string;
}