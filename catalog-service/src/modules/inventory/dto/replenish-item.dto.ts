// src/modules/inventory/dto/replenish-item.dto.ts


import { IsInt, IsNotEmpty, IsUUID, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ReplenishItemDto {
  @ApiProperty({
    description: 'UUID of the menu item to replenish',
    example: '9b1deb4d-5b14-4880-b5e6-4f3e4f2a9b6e',
    format: 'uuid',
  })
  @IsUUID()
  @IsNotEmpty()
  menu_item_id: string;

  @ApiProperty({
    description: 'New stock quantity for the menu item (integer >= 0)',
    example: 10,
    minimum: 0,
    type: Number,
  })
  @IsInt()
  @Min(0)
  @IsNotEmpty()
  stock_quantity: number;
}
