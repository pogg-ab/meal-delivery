// src/modules/analytics/dto/orders-trend.dto.ts

import { ApiProperty } from '@nestjs/swagger';

export class OrdersTrendDto {
  @ApiProperty({
    description: 'The date for the data point (YYYY-MM-DD format).',
    example: '2025-11-25',
  })
  date: string;

  @ApiProperty({
    description: 'The total number of completed orders for that date.',
    example: 15,
  })
  orderCount: number;
}