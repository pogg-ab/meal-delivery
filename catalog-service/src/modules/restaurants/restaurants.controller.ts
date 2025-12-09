import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { RestaurantsService } from './restaurants.service';
import { GetRestaurantsQueryDto } from './dtos/get-restaurants-query.dto';
import { UpdateScheduleSettingsDto } from './dtos/update-schedule-settings.dto';
import { UserId } from 'src/common/decorator/user-id.decorator';
import { Restaurant } from 'src/entities/restaurant.entity';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { GetScheduleSettingsDto } from './dtos/get-schedule-settings.dto';

@ApiTags('Restaurants')
@Controller('restaurants')
export class RestaurantsController {
  constructor(private readonly restaurantsService: RestaurantsService) {}

  @Get()
 @ApiOperation({ summary: 'List restaurants (pagination, search, filter by active, filter by rating)' })
  @ApiResponse({ status: 200, description: 'Paginated restaurants list (no relations)' })
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async findAll(@Query() query: GetRestaurantsQueryDto) {
  return this.restaurantsService.findAll(query);
 }

 @Patch(':restaurantId/schedule-settings')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: "Update a restaurant's scheduling settings (owner only)",
    description: 'Allows the restaurant owner to set their minimum lead time for scheduled orders.',
  })
  @ApiParam({
    name: 'restaurantId',
    type: 'string',
    format: 'uuid',
    description: 'The ID of the restaurant to update.',
  })
  @ApiResponse({
    status: 200,
    description: 'The scheduling settings were updated successfully.',
    type: Restaurant, // Return the updated restaurant object
  })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 404, description: 'Restaurant not found.' })
  updateScheduleSettings(
    @Param('restaurantId', ParseUUIDPipe) restaurantId: string,
    @UserId() ownerId: string,
    @Body() dto: UpdateScheduleSettingsDto,
  ): Promise<Restaurant> {
    return this.restaurantsService.updateScheduleSettings(
      restaurantId,
      ownerId,
      dto,
    );
  }

  // Add this method inside the RestaurantsController class in restaurants.controller.ts

@Get(':restaurantId/schedule-settings')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@ApiOperation({
  summary: "Get a restaurant's current scheduling settings (owner only)",
})
@ApiParam({
  name: 'restaurantId',
  type: 'string',
  format: 'uuid',
  description: 'The ID of the restaurant.',
})
@ApiResponse({
  status: 200,
  description: 'Returns the current scheduling settings.',
  type: GetScheduleSettingsDto, // Use our new DTO for the response schema
})
@ApiResponse({ status: 401, description: 'Unauthorized.' })
@ApiResponse({ status: 404, description: 'Restaurant not found.' })
async getScheduleSettings(
  @Param('restaurantId', ParseUUIDPipe) restaurantId: string,
  @UserId() ownerId: string,
): Promise<GetScheduleSettingsDto> { // Return type is our DTO
  const restaurant = await this.restaurantsService.getScheduleSettings(
    restaurantId,
    ownerId,
  );
  // We explicitly return just the DTO to ensure we don't leak other restaurant data
  return {
    minimumSchedulingLeadTimeMinutes: restaurant.minimumSchedulingLeadTimeMinutes,
  };
}
}



