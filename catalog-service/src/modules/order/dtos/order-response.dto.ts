// catalog-service/src/orders/dtos/order-response.dto.ts

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

  // --- ADDED THIS BLOCK ---
  @ApiProperty({ description: 'Indicates if the order is scheduled for a future time', example: true, required: false })
  isScheduled?: boolean;

  @ApiProperty({
    description: 'The UTC time for the scheduled delivery, if applicable',
    example: '2025-11-24T12:00:00.000Z',
    required: false,
    nullable: true,
  })
  scheduledDeliveryTime?: Date | null;
  // --- END OF ADDED BLOCK ---

  @ApiProperty({ type: [OrderItemResponseDto] })
  items: OrderItemResponseDto[];

  @ApiProperty()
  created_at: Date;

  @ApiProperty()
  updated_at: Date;
}