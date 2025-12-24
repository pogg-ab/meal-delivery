// src/modules/analytics/dto/top-meal.dto.ts

import { ApiProperty } from '@nestjs/swagger';

export class TopMealDto {
  @ApiProperty({ description: 'The UUID of the meal.' })
  mealId: string;

  @ApiProperty({ description: 'The name of the meal.', example: 'Classic Cheeseburger' })
  mealName: string;

  @ApiProperty({ description: 'Total quantity of this meal sold in the last 30 days.', example: 152 })
  quantitySold: number;
}