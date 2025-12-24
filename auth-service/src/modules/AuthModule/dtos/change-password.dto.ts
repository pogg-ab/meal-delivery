import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({
    description: "The user's current password",
    example: 'OldSecurePassword123',
  })
  @IsString()
  oldPassword: string;

  @ApiProperty({
    description: 'The desired new password (minimum 8 characters)',
    example: 'NewSecurePassword456',
  })
  @IsString()
  @MinLength(8, { message: 'New password must be at least 8 characters long' })
  newPassword: string;
}