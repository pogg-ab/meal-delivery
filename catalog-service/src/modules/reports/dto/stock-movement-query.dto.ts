// src/modules/reports/dto/stock-movement-query.dto.ts

import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty } from 'class-validator';

export class StockMovementQueryDto {
  @ApiProperty({
    description: 'The date for the report in YYYY-MM-DD format',
    example: '2023-10-27',
  })
  @IsNotEmpty()
  @IsDateString()
  date: string;
}