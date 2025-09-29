import { ApiProperty } from '@nestjs/swagger';
import { OrderItemResponseDto } from './order-item-response.dto';

export class OrderResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  customer_id: string;

  @ApiProperty()
  restaurant_id: string;

  @ApiProperty()
  status: string;

  @ApiProperty()
  payment_status: string;

  @ApiProperty()
  total_amount: number;

  @ApiProperty()
  currency: string;

  @ApiProperty({ required: false })
  instructions?: string;

  @ApiProperty()
  is_delivery: boolean;

  @ApiProperty({ required: false })
  payment_reference?: string;

  @ApiProperty({ required: false })
  paid_at?: Date;

  @ApiProperty({ type: [OrderItemResponseDto] })
  items: OrderItemResponseDto[];

  @ApiProperty()
  created_at: Date;

  @ApiProperty()
  updated_at: Date;
}
