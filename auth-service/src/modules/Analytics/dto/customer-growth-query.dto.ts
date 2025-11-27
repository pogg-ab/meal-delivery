import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';

export enum TrendPeriod {
  WEEK = 'week',
  MONTH = 'month',
  QUARTER = 'quarter',
}

export class CustomerGrowthQueryDto {
  @ApiPropertyOptional({
    enum: TrendPeriod,
    description: 'The time period for the trend data.',
    default: TrendPeriod.MONTH,
  })
  @IsEnum(TrendPeriod)
  @IsOptional()
  period: TrendPeriod = TrendPeriod.MONTH;
}