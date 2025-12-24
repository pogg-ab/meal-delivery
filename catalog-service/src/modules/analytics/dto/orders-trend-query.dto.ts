// src/modules/analytics/dto/orders-trend-query.dto.ts

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';

export enum TrendPeriod {
  WEEK = '7d',
  MONTH = '30d',
  QUARTER = '90d',
}

export class OrdersTrendQueryDto {
  @ApiPropertyOptional({
    description: 'The time period for the trend data.',
    enum: TrendPeriod,
    default: TrendPeriod.MONTH,
  })
  @IsEnum(TrendPeriod)
  @IsOptional()
  period?: TrendPeriod = TrendPeriod.MONTH;
}