import { IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RefreshTokenDto {
    
@ApiProperty({ example: 'refresh-token-jwt-string' })  
@IsNotEmpty()
refreshToken: string;
}