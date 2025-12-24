import { IsEmail, IsNotEmpty, MinLength, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {

@ApiProperty({ example: 'johndoe', required: false })   
@IsOptional()
@IsString()
username?: string;

@ApiProperty({ example: 'johndoe@example.com' })
@IsEmail()
email: string;

@ApiProperty({ example: 'Password123!', minLength: 6 })
@IsNotEmpty()
@MinLength(6)
password: string;

@ApiProperty({ example: '+1234567890', required: false })
@IsOptional()
@IsString()
phone?: string;
}