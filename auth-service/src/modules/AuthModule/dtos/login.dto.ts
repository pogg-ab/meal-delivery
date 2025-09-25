import { IsBoolean, IsEmail, IsNotEmpty, IsOptional, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {

@ApiProperty({ example: 'user@example.com' })   
@IsEmail()
email: string;

@ApiProperty({ example: 'Password123!', minLength: 6 })
@IsNotEmpty()
@MinLength(6)
password: string;

@ApiProperty({ description: 'Remember me (longer refresh lifetime)', required: false })
@IsOptional()
@IsBoolean()
remember?: boolean;
}