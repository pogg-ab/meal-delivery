import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsNumber } from 'class-validator';


export class RefundDto {
@ApiProperty({ description: 'tx_ref or chapa_tx_id' })
@IsString()
@IsNotEmpty()
identifier: string;


@ApiProperty({ required: false, description: 'Amount to refund (optional)' })
@IsOptional()
@IsNumber()
amount?: number;


@ApiProperty({ required: false })
@IsOptional()
@IsString()
reason?: string;
}