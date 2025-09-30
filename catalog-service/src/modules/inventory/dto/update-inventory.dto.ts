// src/modules/inventory/dto/update-inventory.dto.ts

import { IsInt, IsNotEmpty, IsNumber, Min } from 'class-validator';

export class UpdateInventoryDto {
  @IsNumber()
  @IsNotEmpty()
  @IsInt()
  @Min(0, { message: 'Quantity cannot be less than 0.' })
  stock_quantity: number;
}