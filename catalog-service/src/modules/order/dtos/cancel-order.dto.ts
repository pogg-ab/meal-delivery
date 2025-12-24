import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';


export class CancelOrderDto {
@ApiProperty({ required: false, description: 'Optional reason for cancellation' })
@IsOptional()
@IsString()
reason?: string;
}