// src/modules/reports/dto/order-list-query.dto.ts

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsNotEmpty, IsOptional } from 'class-validator';
import { OrderStatus } from 'src/entities/order.entity'; // Assuming OrderStatus enum is exported

export class OrderListQueryDto {
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
    description: 'Filter orders by a specific status',
    enum: OrderStatus,
    example: 'COMPLETED',
  })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;
}