// File: src/payout/dtos/create-aggregated-batch.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsArray, IsNumber, IsDateString } from 'class-validator';

export class CreateAggregatedBatchDto {
  @ApiProperty({ required: false, example: '2025-11-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  olderThan?: string;

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  restaurantIds?: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  minTotal?: number;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  autoProcess?: boolean;
}
