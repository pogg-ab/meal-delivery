import { ApiProperty } from '@nestjs/swagger';


export class PaymentInitiatedResponseDto {
@ApiProperty()
order_id: string;


@ApiProperty()
tx_ref: string;


@ApiProperty()
checkout_url?: string;


@ApiProperty({ required: false })
expires_at?: string | null;
}