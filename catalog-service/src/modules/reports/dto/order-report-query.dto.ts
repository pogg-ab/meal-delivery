// src/modules/reports/dto/order-report-query.dto.ts

import { IsEnum, IsOptional } from 'class-validator';

export enum ReportPeriod {
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month',
}

export class OrderReportQueryDto {
  @IsOptional()
  @IsEnum(ReportPeriod)
  period: ReportPeriod = ReportPeriod.DAY; // Default to 'day' if not provided
}