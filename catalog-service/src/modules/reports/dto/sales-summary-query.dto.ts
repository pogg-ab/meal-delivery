// src/modules/reports/dto/sales-summary-query.dto.ts

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
} from 'class-validator';

export class SalesSummaryQueryDto {
  @ApiProperty({
    description: 'The start date for the report period (YYYY-MM-DD format)',
    example: '2025-10-01',
  })
  @IsNotEmpty()
  @IsDateString()
  startDate: string;

  @ApiProperty({
    description: 'The end date for the report period (YYYY-MM-DD format)',
    example: '2025-10-31',
  })
  @IsNotEmpty()
  @IsDateString()
  endDate: string;

  @ApiPropertyOptional({
    description: 'The desired output format for the report.',
    enum: ['json', 'csv'],
    default: 'json',
  })
  @IsOptional()
  @IsEnum(['json', 'csv'])
  format?: 'json' | 'csv' = 'json'; // Default to 'json' if not provided
}