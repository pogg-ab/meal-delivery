// src/modules/analytics/dto/performance-metrics.dto.ts

import { ApiProperty } from '@nestjs/swagger';

export class PerformanceMetricsDto {
  @ApiProperty({
    description: 'The average time in minutes for an order to be prepared (from PREPARING to READY).',
    example: 15.7,
  })
  averagePreparationTimeMinutes: number;
}