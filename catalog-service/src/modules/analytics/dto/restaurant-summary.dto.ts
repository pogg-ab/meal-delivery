// src/modules/analytics/dto/restaurant-summary.dto.ts

import { ApiProperty } from '@nestjs/swagger';

export class RestaurantSummaryDto {
  @ApiProperty({
    description: 'Total revenue from completed orders in the last 30 days',
    example: 15780.5,
  })
  totalRevenue: number;

  @ApiProperty({
    description: 'Total number of completed orders in the last 30 days',
    example: 850,
  })
  totalOrders: number;

  @ApiProperty({
    description: 'Average value of a completed order in the last 30 days',
    example: 18.57,
  })
  averageOrderValue: number;
}