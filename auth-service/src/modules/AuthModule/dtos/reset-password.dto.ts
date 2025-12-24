import { IsEmail, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordDto {
  @ApiProperty({ example: 'user@example.com' })  
  @IsEmail()
  email: string;

  @ApiProperty({ example: '123456', description: 'OTP code received via email' })
  @IsString()
  otp: string;

  @ApiProperty({ example: 'strongPa$$w0rd', minLength: 8 })
  @IsString()
  @MinLength(8)
  newPassword: string;
}
