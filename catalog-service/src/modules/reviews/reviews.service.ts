import { Injectable, NotFoundException, ForbiddenException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { Review } from '../../entities/review.entity';
import { MenuItem } from '../../entities/menu-item.entity';
import { Order } from '../../entities/order.entity';
import { MenuCategory } from '../../entities/menu-category.entity';
import { Restaurant } from '../../entities/restaurant.entity';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';
import { 
  ReviewResponseDto, 
  MenuItemReviewsResponseDto, 
  RestaurantRatingResponseDto,
  RatingDistributionDto 
} from './dto/review-response.dto';
import { KafkaProvider } from '../../providers/kafka.provider';

@Injectable()
export class ReviewsService {
  constructor(
    @InjectRepository(Review)
    private readonly reviewRepository: Repository<Review>,
    @InjectRepository(MenuItem)
    private readonly menuItemRepository: Repository<MenuItem>,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(MenuCategory)
    private readonly categoryRepository: Repository<MenuCategory>,
    @InjectRepository(Restaurant)
    private readonly restaurantRepository: Repository<Restaurant>,
    private readonly kafkaProvider: KafkaProvider,
  ) {}

  /**
   * Create a new review for a menu item
   */
  async create(
    customerId: string,
    customerName: string,
    createDto: CreateReviewDto,
  ): Promise<ReviewResponseDto> {
    // Check if menu item exists
    const menuItem = await this.menuItemRepository.findOne({
      where: { id: createDto.menu_item_id },
    });

    if (!menuItem) {
      throw new NotFoundException(`Menu item with ID "${createDto.menu_item_id}" not found.`);
    }

    // Check if customer already reviewed this menu item
    const existingReview = await this.reviewRepository.findOne({
      where: {
        customer_id: customerId,
        menu_item_id: createDto.menu_item_id,
        deleted_at: IsNull(),
      },
    });

    if (existingReview) {
      throw new ConflictException('You have already reviewed this menu item. Please update your existing review.');
    }

    // REQUIRED: User must have ordered this menu item with valid status
    const validOrder = await this.findValidOrderForMenuItem(customerId, createDto.menu_item_id);
    
    if (!validOrder) {
      throw new ForbiddenException(
        'You can only review meals you have ordered. Please order this meal first to leave a review.'
      );
    }

    // Verify specific order if provided, otherwise use the valid order we found
    let orderToUse = validOrder;
    if (createDto.order_id) {
      const specifiedOrder = await this.orderRepository.findOne({
        where: { id: createDto.order_id },
        relations: ['items'],
      });

      if (!specifiedOrder) {
        throw new NotFoundException(`Order with ID "${createDto.order_id}" not found.`);
      }

      if (specifiedOrder.customer_id !== customerId) {
        throw new ForbiddenException('You can only review items from your own orders.');
      }

      // Check if the menu item was in this order
      const orderContainsMenuItem = specifiedOrder.items.some(item => item.menu_item_id === createDto.menu_item_id);
      if (!orderContainsMenuItem) {
        throw new BadRequestException('This menu item was not part of the specified order.');
      }

      // Verify order status
      if (!this.isValidOrderStatus(specifiedOrder.status)) {
        throw new BadRequestException(
          'You can only review orders that are awaiting payment or paid. Current status: ' + specifiedOrder.status
        );
      }

      orderToUse = specifiedOrder;
    }

    // Create the review (all reviews are verified since we enforce ordering)
    const review = this.reviewRepository.create({
      menu_item_id: createDto.menu_item_id,
      customer_id: customerId,
      order_id: orderToUse.id, // Always link to the order
      rating: createDto.rating,
      comment: createDto.comment || null,
      customer_name: customerName,
      is_verified_purchase: true, // Always true since we require valid order
    });

    const savedReview = await this.reviewRepository.save(review);

    // Update cached ratings
    await this.updateMenuItemRating(createDto.menu_item_id);
    await this.updateRestaurantRatingForMenuItem(createDto.menu_item_id);

    // Emit Kafka event for analytics
    await this.kafkaProvider.emit('review.created', {
      review_id: savedReview.id,
      menu_item_id: savedReview.menu_item_id,
      customer_id: savedReview.customer_id,
      rating: savedReview.rating,
      is_verified_purchase: savedReview.is_verified_purchase,
      created_at: savedReview.created_at,
    });

    return this.mapToResponseDto(savedReview);
  }

  /**
   * Update an existing review
   */
  async update(
    customerId: string,
    reviewId: string,
    updateDto: UpdateReviewDto,
  ): Promise<ReviewResponseDto> {
    const review = await this.reviewRepository.findOne({
      where: { id: reviewId },
    });

    if (!review) {
      throw new NotFoundException(`Review with ID "${reviewId}" not found.`);
    }

    if (review.customer_id !== customerId) {
      throw new ForbiddenException('You can only update your own reviews.');
    }

    if (review.deleted_at) {
      throw new BadRequestException('Cannot update a deleted review.');
    }

    // Update the review
    if (updateDto.rating !== undefined) {
      review.rating = updateDto.rating;
    }
    if (updateDto.comment !== undefined) {
      review.comment = updateDto.comment;
    }

    const updatedReview = await this.reviewRepository.save(review);

    // Update cached ratings
    await this.updateMenuItemRating(review.menu_item_id);
    await this.updateRestaurantRatingForMenuItem(review.menu_item_id);

    // Emit Kafka event
    await this.kafkaProvider.emit('review.updated', {
      review_id: updatedReview.id,
      menu_item_id: updatedReview.menu_item_id,
      customer_id: updatedReview.customer_id,
      rating: updatedReview.rating,
      updated_at: updatedReview.updated_at,
    });

    return this.mapToResponseDto(updatedReview);
  }

  /**
   * Delete a review (soft delete)
   */
  async delete(customerId: string, reviewId: string): Promise<void> {
    const review = await this.reviewRepository.findOne({
      where: { id: reviewId },
    });

    if (!review) {
      throw new NotFoundException(`Review with ID "${reviewId}" not found.`);
    }

    if (review.customer_id !== customerId) {
      throw new ForbiddenException('You can only delete your own reviews.');
    }

    await this.reviewRepository.softRemove(review);

    // Update cached ratings
    await this.updateMenuItemRating(review.menu_item_id);
    await this.updateRestaurantRatingForMenuItem(review.menu_item_id);

    // Emit Kafka event
    await this.kafkaProvider.emit('review.deleted', {
      review_id: reviewId,
      menu_item_id: review.menu_item_id,
      customer_id: customerId,
      deleted_at: new Date(),
    });
  }

  /**
   * Get all reviews for a specific menu item with rating statistics
   */
  async getMenuItemReviews(
    menuItemId: string,
    page: number = 1,
    limit: number = 10,
  ): Promise<MenuItemReviewsResponseDto> {
    // Check if menu item exists
    const menuItem = await this.menuItemRepository.findOne({
      where: { id: menuItemId },
    });

    if (!menuItem) {
      throw new NotFoundException(`Menu item with ID "${menuItemId}" not found.`);
    }

    // Get all reviews for this menu item
    const [reviews, total] = await this.reviewRepository.findAndCount({
      where: { menu_item_id: menuItemId },
      order: { created_at: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    // Calculate statistics
    const stats = await this.calculateMenuItemStats(menuItemId);

    return {
      menu_item_id: menuItemId,
      menu_item_name: menuItem.name,
      average_rating: stats.averageRating,
      total_reviews: stats.totalReviews,
      rating_distribution: stats.ratingDistribution,
      reviews: reviews.map(review => this.mapToResponseDto(review)),
    };
  }

  /**
   * Get restaurant rating derived from all meal ratings
   */
  async getRestaurantRating(restaurantId: string): Promise<RestaurantRatingResponseDto> {
    // Get restaurant with categories and menu items
    const categories = await this.categoryRepository.find({
      where: { restaurant_id: restaurantId },
      relations: ['restaurant', 'menu_items'],
    });

    if (categories.length === 0) {
      throw new NotFoundException(`Restaurant with ID "${restaurantId}" not found.`);
    }

    const restaurant = categories[0].restaurant;
    const menuItemIds = categories.flatMap(cat => cat.menu_items.map(item => item.id));

    if (menuItemIds.length === 0) {
      return {
        restaurant_id: restaurantId,
        restaurant_name: restaurant.name,
        average_rating: 0,
        total_reviews: 0,
        rating_distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      };
    }

    // Get all reviews for menu items in this restaurant
    const reviews = await this.reviewRepository
      .createQueryBuilder('review')
      .where('review.menu_item_id IN (:...menuItemIds)', { menuItemIds })
      .andWhere('review.deleted_at IS NULL')
      .getMany();

    // Calculate statistics
    const stats = this.calculateStats(reviews);

    return {
      restaurant_id: restaurantId,
      restaurant_name: restaurant.name,
      average_rating: stats.averageRating,
      total_reviews: stats.totalReviews,
      rating_distribution: stats.ratingDistribution,
    };
  }

  /**
   * Get customer's own reviews
   */
  async getCustomerReviews(customerId: string): Promise<ReviewResponseDto[]> {
    const reviews = await this.reviewRepository.find({
      where: { customer_id: customerId },
      order: { created_at: 'DESC' },
    });

    return reviews.map(review => this.mapToResponseDto(review));
  }

  /**
   * Calculate statistics for a specific menu item
   */
  private async calculateMenuItemStats(menuItemId: string) {
    const reviews = await this.reviewRepository.find({
      where: { menu_item_id: menuItemId, deleted_at: IsNull() },
    });

    return this.calculateStats(reviews);
  }

  /**
   * Calculate rating statistics from an array of reviews
   */
  private calculateStats(reviews: Review[]) {
    const totalReviews = reviews.length;
    
    const ratingDistribution: RatingDistributionDto = {
      1: reviews.filter(r => r.rating === 1).length,
      2: reviews.filter(r => r.rating === 2).length,
      3: reviews.filter(r => r.rating === 3).length,
      4: reviews.filter(r => r.rating === 4).length,
      5: reviews.filter(r => r.rating === 5).length,
    };

    const averageRating = totalReviews > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews
      : 0;

    return {
      averageRating: Math.round(averageRating * 10) / 10, // Round to 1 decimal
      totalReviews,
      ratingDistribution,
    };
  }

  /**
   * Map entity to response DTO
   */
  private mapToResponseDto(review: Review): ReviewResponseDto {
    return {
      id: review.id,
      menu_item_id: review.menu_item_id,
      rating: review.rating,
      comment: review.comment,
      customer_name: review.customer_name,
      is_verified_purchase: review.is_verified_purchase,
      created_at: review.created_at,
      updated_at: review.updated_at,
    };
  }

  /**
   * Check if a customer can review a specific menu item
   */
  async canReview(customerId: string, menuItemId: string) {
    // Check if menu item exists
    const menuItem = await this.menuItemRepository.findOne({
      where: { id: menuItemId },
    });

    if (!menuItem) {
      throw new NotFoundException(`Menu item with ID "${menuItemId}" not found.`);
    }

    // Check if already reviewed
    const existingReview = await this.reviewRepository.findOne({
      where: {
        customer_id: customerId,
        menu_item_id: menuItemId,
        deleted_at: IsNull(),
      },
    });

    const hasReviewed = !!existingReview;

    // Check if has ordered with valid status
    const validOrder = await this.findValidOrderForMenuItem(customerId, menuItemId);
    const hasOrdered = !!validOrder;

    const canReview = hasOrdered && !hasReviewed;
    let reason: string | null = null;

    if (!hasOrdered) {
      reason = 'You must order this meal before you can review it';
    } else if (hasReviewed) {
      reason = 'You have already reviewed this item';
    }

    return {
      can_review: canReview,
      reason,
      has_reviewed: hasReviewed,
      has_ordered: hasOrdered,
    };
  }

  /**
   * Find a valid order for a customer that contains the menu item
   * Valid order statuses: AWAITING_PAYMENT, PAID (and future paid statuses)
   */
  private async findValidOrderForMenuItem(customerId: string, menuItemId: string) {
    const order = await this.orderRepository
      .createQueryBuilder('order')
      .innerJoin('order.items', 'item')
      .where('order.customer_id = :customerId', { customerId })
      .andWhere('item.menu_item_id = :menuItemId', { menuItemId })
      .andWhere('order.status IN (:...validStatuses)', {
        validStatuses: ['AWAITING_PAYMENT', 'PAID', 'PREPARING', 'READY', 'CUSTOMER_COMING', 'OUT_FOR_DELIVERY', 'DELIVERED', 'COMPLETED'],
      })
      .getOne();

    return order;
  }

  /**
   * Check if order status is valid for reviewing
   * Currently: AWAITING_PAYMENT or PAID (will be restricted to PAID only after payment integration)
   */
  private isValidOrderStatus(status: string): boolean {
    const validStatuses = [
      'AWAITING_PAYMENT',
      'PAID',
      'PREPARING',
      'READY',
      'CUSTOMER_COMING',
      'OUT_FOR_DELIVERY',
      'DELIVERED',
      'COMPLETED',
    ];
    return validStatuses.includes(status);
  }

  /**
   * Update cached rating for a menu item
   */
  private async updateMenuItemRating(menuItemId: string): Promise<void> {
    const stats = await this.calculateMenuItemStats(menuItemId);
    
    await this.menuItemRepository.update(menuItemId, {
      average_rating: stats.totalReviews > 0 ? stats.averageRating : null,
      total_reviews: stats.totalReviews,
    });
  }

  /**
   * Update cached rating for a restaurant based on a menu item change
   */
  private async updateRestaurantRatingForMenuItem(menuItemId: string): Promise<void> {
    // Find the restaurant for this menu item
    const menuItem = await this.menuItemRepository.findOne({
      where: { id: menuItemId },
      relations: ['category', 'category.restaurant'],
    });

    if (!menuItem || !menuItem.category || !menuItem.category.restaurant) {
      return;
    }

    const restaurantId = menuItem.category.restaurant.id;
    
    // Get all menu items for this restaurant
    const categories = await this.categoryRepository.find({
      where: { restaurant_id: restaurantId },
      relations: ['menu_items'],
    });

    const menuItemIds = categories.flatMap(cat => cat.menu_items.map(item => item.id));

    if (menuItemIds.length === 0) {
      return;
    }

    // Get all reviews for menu items in this restaurant
    const reviews = await this.reviewRepository
      .createQueryBuilder('review')
      .where('review.menu_item_id IN (:...menuItemIds)', { menuItemIds })
      .andWhere('review.deleted_at IS NULL')
      .getMany();

    const stats = this.calculateStats(reviews);

    // Update restaurant rating
    await this.restaurantRepository.update(restaurantId, {
      average_rating: stats.totalReviews > 0 ? stats.averageRating : null,
      total_reviews: stats.totalReviews,
    });
  }
}
