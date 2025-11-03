// src/modules/inventory/dto/update-inventory.dto.ts
import { IsInt, IsNotEmpty, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateInventoryDto {
  @ApiProperty({
    description: 'New stock quantity',
    example: 3,
    minimum: 0,
    type: Number,
  })
  @IsInt()
  @Min(0, { message: 'Quantity cannot be less than 0.' })
  @IsNotEmpty()
  stock_quantity: number;
}
