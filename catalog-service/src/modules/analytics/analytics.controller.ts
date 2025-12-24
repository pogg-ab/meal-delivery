import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';

import { AnalyticsService } from './analytics.service';
import { RestaurantSummaryDto } from './dto/restaurant-summary.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { UserId } from '../../common/decorator/user-id.decorator'; // Import UserId decorator
import { OrdersTrendQueryDto } from './dto/orders-trend-query.dto';
import { OrdersTrendDto } from './dto/orders-trend.dto';
import { RevenueTrendDto } from './dto/revenue-trend.dto';
import { TopMealDto } from './dto/top-meal.dto';
import { TopItemsQueryDto } from './dto/top-items-query.dto';
import { TopCustomerDto } from './dto/top-customer.dto';
import { PerformanceMetricsDto } from './dto/performance-metrics.dto';
import { CancellationStatsDto } from './dto/cancellation-stats.dto';
import { AdminSummaryDto } from './dto/admin-summary.dto';
import { Roles } from 'src/common/decorator/roles.decorator';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { TopRestaurantDto } from './dto/top-restaurant.dto';
import { PaymentHealthDto } from './dto/payment-health.dto';

@ApiTags('Analytics')
@ApiBearerAuth('access-token')
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('restaurant/:restaurantId/summary')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: "Get a restaurant's performance summary (owner only)",
    description:
      'Provides key metrics like total revenue, total orders, and average order value for the last 30 days. Accessible only by the restaurant owner.',
  })
  @ApiParam({
    name: 'restaurantId',
    type: 'string',
    format: 'uuid',
    description: 'The ID of the restaurant.',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved the analytics summary.',
    type: RestaurantSummaryDto,
  })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  getRestaurantSummary(
    @Param('restaurantId', ParseUUIDPipe) restaurantId: string,
    @UserId() ownerId: string, // <-- ADDED: Inject the owner's ID from the token
  ): Promise<RestaurantSummaryDto> {
    // Pass both IDs to the service
    return this.analyticsService.getRestaurantSummary(restaurantId, ownerId);
  }

   @Get('restaurant/:restaurantId/orders/trends')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Get daily order volume trends for a restaurant (owner only)',
    description: 'Provides a time-series of completed order counts per day for the selected period.',
  })
  @ApiParam({ name: 'restaurantId', type: 'string', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved the order trend data.',
    type: [OrdersTrendDto],
  })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  getOrderTrends(
    @Param('restaurantId', ParseUUIDPipe) restaurantId: string,
    @UserId() ownerId: string,
    @Query() query: OrdersTrendQueryDto,
  ): Promise<OrdersTrendDto[]> {
    return this.analyticsService.getOrderTrends(restaurantId, ownerId, query);
  }

  @Get('restaurant/:restaurantId/revenue/trends')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Get daily revenue trends for a restaurant (owner only)',
    description: 'Provides a time-series of total revenue per day for the selected period.',
  })
  @ApiParam({ name: 'restaurantId', type: 'string', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved the revenue trend data.',
    type: [RevenueTrendDto],
  })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  getRevenueTrends(
    @Param('restaurantId', ParseUUIDPipe) restaurantId: string,
    @UserId() ownerId: string,
    @Query() query: OrdersTrendQueryDto,
  ): Promise<RevenueTrendDto[]> {
    return this.analyticsService.getRevenueTrends(restaurantId, ownerId, query);
  }

  @Get('restaurant/:restaurantId/top-meals')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Get top-selling meals for a restaurant (owner only)',
    description: 'Provides a ranked list of the most sold menu items by quantity over the last 30 days.',
  })
  @ApiParam({ name: 'restaurantId', type: 'string', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved the top-selling meals.',
    type: [TopMealDto],
  })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  getTopMeals(
    @Param('restaurantId', ParseUUIDPipe) restaurantId: string,
    @UserId() ownerId: string,
    @Query() query: TopItemsQueryDto,
  ): Promise<TopMealDto[]> {
    return this.analyticsService.getTopMeals(restaurantId, ownerId, query);
  }

   @Get('restaurant/:restaurantId/customers/top')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Get most active customers for a restaurant (owner only)',
    description: 'Provides a ranked list of the most active customers by number of completed orders over the last 30 days.',
  })
  @ApiParam({ name: 'restaurantId', type: 'string', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved the top customers.',
    type: [TopCustomerDto],
  })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  getTopCustomers(
    @Param('restaurantId', ParseUUIDPipe) restaurantId: string,
    @UserId() ownerId: string,
    @Query() query: TopItemsQueryDto, // Reuse the same query DTO for the limit
  ): Promise<TopCustomerDto[]> {
    return this.analyticsService.getTopCustomers(restaurantId, ownerId, query);
  }

  @Get('restaurant/:restaurantId/delivery-performance')
@UseGuards(JwtAuthGuard)
@ApiOperation({
  summary: 'Get order preparation performance metrics (owner only)', // <-- Updated summary
  description: 'Provides the average time for order preparation over the last 30 days.', // <-- Updated description
})
@ApiParam({ name: 'restaurantId', type: 'string', format: 'uuid' })
@ApiResponse({
  status: 200,
  description: 'Successfully retrieved the performance metrics.',
  type: PerformanceMetricsDto, // <-- This DTO is now simpler
})
@ApiResponse({ status: 403, description: 'Forbidden.' })
getPerformanceMetrics(
  @Param('restaurantId', ParseUUIDPipe) restaurantId: string,
  @UserId() ownerId: string,
): Promise<PerformanceMetricsDto> {
  return this.analyticsService.getPerformanceMetrics(restaurantId, ownerId);
}
@Get('restaurant/:restaurantId/cancellations')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Get order cancellation statistics for a restaurant (owner only)',
    description: 'Provides total cancellations, cancellation rate, and the most frequently cancelled meal over the last 30 days.',
  })
  @ApiParam({ name: 'restaurantId', type: 'string', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved the cancellation statistics.',
    type: CancellationStatsDto,
  })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  getCancellationStats(
    @Param('restaurantId', ParseUUIDPipe) restaurantId: string,
    @UserId() ownerId: string,
  ): Promise<CancellationStatsDto> {
    return this.analyticsService.getCancellationStats(restaurantId, ownerId);
  }

   @Get('admin/summary')
  // NOTE: We do NOT use RestaurantOwnershipGuard here.
  @UseGuards(JwtAuthGuard, RolesGuard) 
  // Use the exact role name from your database for platform admins
  @Roles('platform_admin') 
  @ApiOperation({
    summary: 'Get a platform-wide analytics summary (Admins only)',
    description: 'Provides key metrics like total platform revenue, total orders, and new customer signups over the last 30 days.',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved the admin analytics summary.',
    type: AdminSummaryDto,
  })
  @ApiResponse({ status: 403, description: 'Forbidden. Requires admin role.' })
  getAdminSummary(): Promise<AdminSummaryDto> {
    return this.analyticsService.getAdminSummary();
  }

  @Get('admin/top-restaurants')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('platform_admin')
  @ApiOperation({
    summary: 'Get top-performing restaurants by revenue (Admins only)',
    description: 'Provides a ranked list of restaurants by their total revenue from completed orders over the last 30 days.',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved the list of top-performing restaurants.',
    type: [TopRestaurantDto],
  })
  @ApiResponse({ status: 403, description: 'Forbidden. Requires admin role.' })
  getTopRestaurants(
    @Query() query: TopItemsQueryDto, // Reuse DTO for the limit
  ): Promise<TopRestaurantDto[]> {
    return this.analyticsService.getTopRestaurants(query);
  }

  @Get('admin/low-performing-restaurants')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('platform_admin')
  @ApiOperation({
    summary: 'Get low-performing restaurants by revenue (Admins only)',
    description: 'Provides a ranked list of restaurants with the lowest total revenue from completed orders over the last 30 days.',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved the list of low-performing restaurants.',
    type: [TopRestaurantDto],
  })
  @ApiResponse({ status: 403, description: 'Forbidden. Requires admin role.' })
  getLowPerformingRestaurants(
    @Query() query: TopItemsQueryDto,
  ): Promise<TopRestaurantDto[]> {
    return this.analyticsService.getLowPerformingRestaurants(query);
  }
  @Get('admin/top-meals')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('platform_admin')
  @ApiOperation({
    summary: 'Get top-selling meals across the entire platform (Admins only)',
    description: 'Provides a ranked list of the most sold menu items by quantity over the last 30 days.',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved the top-selling meals.',
    type: [TopMealDto], // Reuse the existing DTO
  })
  @ApiResponse({ status: 403, description: 'Forbidden. Requires admin role.' })
  getPlatformTopMeals(
    @Query() query: TopItemsQueryDto, // Reuse the existing DTO
  ): Promise<TopMealDto[]> {
    return this.analyticsService.getPlatformTopMeals(query);
  }

  @Get('admin/orders/trends')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('platform_admin')
  @ApiOperation({
    summary: 'Get daily order volume trends for the entire platform (Admins only)',
    description: 'Provides a time-series of total completed order counts per day for the selected period.',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved the platform-wide order trend data.',
    type: [OrdersTrendDto], // Reuse the existing DTO
  })
  @ApiResponse({ status: 403, description: 'Forbidden. Requires admin role.' })
  getPlatformOrderTrends(
    @Query() query: OrdersTrendQueryDto, // Reuse the existing DTO
  ): Promise<OrdersTrendDto[]> {
    return this.analyticsService.getPlatformOrderTrends(query);
  }

  @Get('admin/payment-health')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('platform_admin')
  @ApiOperation({
    summary: 'Get a summary of payment health across the platform (Admins only)',
    description: 'Provides counts of successful and failed payments and the overall success rate over the last 30 days.',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved the payment health summary.',
    type: PaymentHealthDto,
  })
  @ApiResponse({ status: 403, description: 'Forbidden. Requires admin role.' })
  getPaymentHealth(): Promise<PaymentHealthDto> {
    return this.analyticsService.getPaymentHealth();
  }
}