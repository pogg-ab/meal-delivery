// src/modules/analytics/dto/top-items-query.dto.ts

import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class TopItemsQueryDto {
  @ApiPropertyOptional({
    description: 'The maximum number of top items to return.',
    default: 5,
    minimum: 1,
    maximum: 20,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  @IsOptional()
  limit?: number = 5;
}