import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LogoutDto {
  @ApiProperty({ example: 'refresh-token-jwt-string' })  
  @IsString()
  refreshToken: string;
}