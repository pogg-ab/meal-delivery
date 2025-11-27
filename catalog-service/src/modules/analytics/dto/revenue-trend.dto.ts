// src/modules/analytics/dto/revenue-trend.dto.ts

import { ApiProperty } from '@nestjs/swagger';

export class RevenueTrendDto {
  @ApiProperty({
    description: 'The date for the data point (YYYY-MM-DD format).',
    example: '2025-11-25',
  })
  date: string;

  @ApiProperty({
    description: 'The total revenue from completed orders for that date.',
    example: 2250,
  })
  totalRevenue: number;
}