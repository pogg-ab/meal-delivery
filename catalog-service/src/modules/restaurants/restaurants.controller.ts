import { Controller, Get, Query, UsePipes, ValidationPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { RestaurantsService } from './restaurants.service';
import { GetRestaurantsQueryDto } from './dtos/get-restaurants-query.dto';

@ApiTags('Restaurants')
@Controller('restaurants')
export class RestaurantsController {
  constructor(private readonly restaurantsService: RestaurantsService) {}

  @Get()
  @ApiOperation({ summary: 'List restaurants (pagination, search, filter by active)' })
  @ApiResponse({ status: 200, description: 'Paginated restaurants list (no relations)' })
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async findAll(@Query() query: GetRestaurantsQueryDto) {
  return this.restaurantsService.findAll(query);
 }
}



