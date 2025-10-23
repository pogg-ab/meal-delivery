import { Controller, Get, Query, ValidationPipe } from '@nestjs/common';
import { SearchService } from './search.service';
import { ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

// DTO for validating all incoming query parameters
class SearchQueryDto {
  @IsString()
  @IsNotEmpty()
  q: string;

  @IsOptional()
  @IsIn(['all', 'restaurant', 'item']) // <-- CHANGED from 'food' to 'item'
  type?: 'all' | 'restaurant' | 'item'; // <-- CHANGED from 'food' to 'item'

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  limit?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  offset?: number;
}

@ApiTags('Search')
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  // Swagger documentation for all API parameters
  @ApiQuery({ name: 'q', required: true, type: String, description: 'The search keyword' })
  @ApiQuery({ name: 'type', required: false, enum: ['all', 'restaurant', 'item'], description: 'Filter by type' }) // <-- CHANGED from 'food' to 'item'
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Number of results per page (default: 10)' })
  @ApiQuery({ name: 'offset', required: false, type: Number, description: 'Starting offset for results (default: 0)' })
  @ApiResponse({ status: 200, description: 'A paginated list of search results.' })
  @ApiResponse({ status: 400, description: 'Bad Request. Invalid query parameters.' })
  async search(
    @Query(new ValidationPipe({ transform: true, forbidNonWhitelisted: true })) queryDto: SearchQueryDto,
  ) {
    const { limit = 10, offset = 0 } = queryDto;
    
    const searchData = await this.searchService.performSearch(queryDto);
    
    // Assemble the final structured response
    return {
      query: queryDto.q,
      type: queryDto.type || 'all',
      pagination: {
        total: searchData.total,
        limit,
        offset,
      },
      results: searchData.results,
    };
  }
}