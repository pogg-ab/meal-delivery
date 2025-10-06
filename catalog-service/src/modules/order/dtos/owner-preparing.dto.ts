import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';


export class OwnerPreparingDto {
@ApiProperty({ required: false, description: 'Optional note from owner/kitchen' })
@IsOptional()
@IsString()
note?: string;
}