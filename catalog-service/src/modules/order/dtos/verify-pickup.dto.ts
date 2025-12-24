import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class VerifyPickupDto {
  @ApiProperty({ required: false, description: '6-digit code' })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiProperty({ required: false, description: 'Signed pickup token (from QR)' })
  @IsOptional()
  @IsString()
  token?: string;
}
