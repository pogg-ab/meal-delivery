import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, IsNumber, IsOptional, IsString } from 'class-validator';


export class PaymentInitiateDto {
@ApiProperty({ description: 'Order id', example: 'uuid' })
@IsUUID()
order_id: string;


@ApiProperty({ example: 55.0 })
@IsNumber()
amount: number;


@ApiProperty({ example: 'ETB' })
@IsOptional()
@IsString()
currency?: string;


@ApiProperty({ description: 'Customer id (uuid)' })
@IsUUID()
customer_id: string;


@ApiProperty({ description: 'Restaurant id (uuid)' })
@IsUUID()
restaurant_id: string;


@ApiProperty({ required: false, description: 'Optional return url to override default' })
@IsOptional()
@IsString()
return_url?: string;
}