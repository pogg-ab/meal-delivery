// src/modules/inventory/dto/replenish-item.dto.ts

import { IsInt, IsNotEmpty, IsUUID, Min } from 'class-validator';

export class ReplenishItemDto {
  @IsUUID()
  @IsNotEmpty()
  menu_item_id: string;

  @IsInt()
  @Min(0)
  @IsNotEmpty()
  stock_quantity: number;
}