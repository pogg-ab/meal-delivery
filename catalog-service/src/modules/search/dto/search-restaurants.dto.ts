// in catalog-service/src/modules/search/dto/search-restaurants.dto.ts

import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsLatitude, IsLongitude, IsNumber, IsOptional, Max, Min } from 'class-validator';

export class SearchRestaurantsDto {
  @ApiProperty({
    description: 'The latitude of the search origin.',
    example: 9.005401,
  })
  @Type(() => Number)
  @IsLatitude()
  latitude: number;

  @ApiProperty({
    description: 'The longitude of the search origin.',
    example: 38.763611,
  })
  @Type(() => Number)
  @IsLongitude()
  longitude: number;

  @ApiProperty({
    description: 'The search radius in kilometers (km).',
    example: 5,
    default: 10,
    required: false,
  })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(50)
  @IsOptional()
  radius: number = 10;

  @ApiProperty({
    description: 'The page number for pagination.',
    minimum: 1,
    default: 1,
    required: false,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page: number = 1;

  @ApiProperty({
    description: 'The number of results to return per page.',
    minimum: 1,
    maximum: 100,
    default: 10,
    required: false,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit: number = 10;

   @ApiProperty({
    description: 'Filter by minimum restaurant rating.',
    minimum: 0,
    maximum: 5,
    required: false,
  })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(5)
  @IsOptional()
  minRating?: number;

}