import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, IsInt, Min, IsOptional, IsString } from 'class-validator';

export class OrderItemDto {
  @ApiProperty({ description: 'Menu item id', example: 'uuid-of-menu-item' })
  @IsUUID()
  menu_item_id: string;

  @ApiProperty({ description: 'Quantity', example: 2 })
  @IsInt()
  @Min(1)
  quantity: number;
}
