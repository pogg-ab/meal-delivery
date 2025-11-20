import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';
import { 
  ReviewResponseDto, 
  MenuItemReviewsResponseDto, 
  RestaurantRatingResponseDto,
  CanReviewResponseDto 
} from './dto/review-response.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('Reviews')
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Create a new review for a menu item (Authenticated users only)' })
  @ApiResponse({ status: 201, description: 'Review created successfully', type: ReviewResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid input or business rule violation' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Menu item or order not found' })
  @ApiResponse({ status: 409, description: 'Review already exists' })
  async create(
    @Body() createDto: CreateReviewDto,
    @Req() req,
  ): Promise<ReviewResponseDto> {
    const customerId = req.user.userId;
    const customerName = req.user.username || req.user.email || 'Anonymous';
    return this.reviewsService.create(customerId, customerName, createDto);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Update your own review' })
  @ApiResponse({ status: 200, description: 'Review updated successfully', type: ReviewResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Not your review' })
  @ApiResponse({ status: 404, description: 'Review not found' })
  async update(
    @Param('id', ParseUUIDPipe) reviewId: string,
    @Body() updateDto: UpdateReviewDto,
    @Req() req,
  ): Promise<ReviewResponseDto> {
    const customerId = req.user.userId;
    return this.reviewsService.update(customerId, reviewId, updateDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete your own review' })
  @ApiResponse({ status: 204, description: 'Review deleted successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Not your review' })
  @ApiResponse({ status: 404, description: 'Review not found' })
  async delete(
    @Param('id', ParseUUIDPipe) reviewId: string,
    @Req() req,
  ): Promise<void> {
    const customerId = req.user.userId;
    return this.reviewsService.delete(customerId, reviewId);
  }

  @Get('menu-item/:menuItemId')
  @ApiOperation({ summary: 'Get all reviews for a specific menu item with statistics (Public)' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiResponse({ status: 200, description: 'Reviews retrieved successfully', type: MenuItemReviewsResponseDto })
  @ApiResponse({ status: 404, description: 'Menu item not found' })
  async getMenuItemReviews(
    @Param('menuItemId', ParseUUIDPipe) menuItemId: string,
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ): Promise<MenuItemReviewsResponseDto> {
    return this.reviewsService.getMenuItemReviews(menuItemId, page || 1, limit || 10);
  }

  @Get('restaurant/:restaurantId')
  @ApiOperation({ summary: 'Get restaurant rating aggregated from all meal ratings (Public)' })
  @ApiResponse({ status: 200, description: 'Restaurant rating retrieved successfully', type: RestaurantRatingResponseDto })
  @ApiResponse({ status: 404, description: 'Restaurant not found' })
  async getRestaurantRating(
    @Param('restaurantId', ParseUUIDPipe) restaurantId: string,
  ): Promise<RestaurantRatingResponseDto> {
    return this.reviewsService.getRestaurantRating(restaurantId);
  }

  @Get('my-reviews')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get all your own reviews' })
  @ApiResponse({ status: 200, description: 'Reviews retrieved successfully', type: [ReviewResponseDto] })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getMyReviews(@Req() req): Promise<ReviewResponseDto[]> {
    const customerId = req.user.userId;
    return this.reviewsService.getCustomerReviews(customerId);
  }

  @Get('can-review/:menuItemId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ 
    summary: 'Check if you can review a specific menu item',
    description: 'Returns whether the authenticated user can review this meal (must have ordered it with valid status and not already reviewed)'
  })
  @ApiResponse({ status: 200, description: 'Check result retrieved successfully', type: CanReviewResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Menu item not found' })
  async canReview(
    @Param('menuItemId', ParseUUIDPipe) menuItemId: string,
    @Req() req,
  ): Promise<CanReviewResponseDto> {
    const customerId = req.user.userId;
    return this.reviewsService.canReview(customerId, menuItemId);
  }
}
