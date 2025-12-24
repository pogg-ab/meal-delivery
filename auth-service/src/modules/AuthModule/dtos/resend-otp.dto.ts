import { IsEmail, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ResendOtpDto {
  @ApiProperty({ example: 'user@example.com' }) 
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ example: 'registration', enum: ['registration', 'password_reset'] })
  @IsOptional()
  @IsString()
  purpose?: 'registration' | 'password_reset';
}

