import { ApiProperty } from '@nestjs/swagger';

export class OrderItemResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  order_id: string;

  @ApiProperty()
  menu_item_id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  unit_price: number;

  @ApiProperty()
  quantity: number;

  @ApiProperty()
  subtotal: number;

  @ApiProperty({ required: false })
  instructions?: string;
}
