// src/modules/analytics/dto/admin-summary.dto.ts

import { ApiProperty } from '@nestjs/swagger';

export class AdminSummaryDto {
  @ApiProperty({
    description: 'Total revenue from all completed orders across the platform in the last 30 days.',
    example: 125430.5,
  })
  totalPlatformRevenue: number;

  @ApiProperty({
    description: 'Total number of all completed orders across the platform in the last 30 days.',
    example: 8550,
  })
  totalPlatformOrders: number;

  @ApiProperty({
    description: 'Total number of new customers who signed up in the last 30 days.',
    example: 512,
  })
  newCustomerSignups: number;
}