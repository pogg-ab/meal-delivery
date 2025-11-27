// src/modules/analytics/dto/most-cancelled-meal.dto.ts

import { ApiProperty } from '@nestjs/swagger';

export class MostCancelledMealDto {
  @ApiProperty({ description: 'The UUID of the meal.' })
  mealId: string;

  @ApiProperty({ description: 'The name of the meal.', example: 'Spicy Tuna Roll' })
  mealName: string;

  @ApiProperty({ description: 'The number of times this meal appeared in cancelled orders.', example: 3 })
  cancellationCount: number;
}