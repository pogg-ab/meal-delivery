import { IsOptional, IsInt, Min, Max, IsBooleanString } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class GetRestaurantsQueryDto {
  @ApiPropertyOptional({ description: 'Page number (1-based)', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page', example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ description: 'Search by restaurant name (ILIKE)', example: 'pizza' })
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ description: 'Filter active restaurants (true/false)', example: true })
  @IsOptional()
  @IsBooleanString()
  is_active?: string; // will be parsed to boolean in service
}
