// src/modules/analytics/dto/cancellation-stats.dto.ts

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MostCancelledMealDto } from './most-cancelled-meal.dto';

export class CancellationStatsDto {
  @ApiProperty({ description: 'The total number of cancelled orders in the last 30 days.', example: 5 })
  totalCancellations: number;

  @ApiProperty({
    description: 'The percentage of total orders that were cancelled (e.g., 0.05 for 5%).',
    example: 0.048,
  })
  cancellationRate: number;

  @ApiPropertyOptional({
    description: 'The meal that was most frequently part of a cancelled order. Null if no cancellations.',
    type: MostCancelledMealDto,
    nullable: true,
  })
  mostCancelledMeal: MostCancelledMealDto | null;
}