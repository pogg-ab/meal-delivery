import { ApiProperty } from '@nestjs/swagger';

export class RatingDistributionDto {
  @ApiProperty({ example: 2 })
  1: number;

  @ApiProperty({ example: 5 })
  2: number;

  @ApiProperty({ example: 15 })
  3: number;

  @ApiProperty({ example: 35 })
  4: number;

  @ApiProperty({ example: 70 })
  5: number;
}

export class ReviewResponseDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  id: string;

  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174001' })
  menu_item_id: string;

  @ApiProperty({ example: 5 })
  rating: number;

  @ApiProperty({ example: 'Absolutely delicious! The flavors were amazing.', nullable: true })
  comment: string | null;

  @ApiProperty({ example: 'John Doe', nullable: true })
  customer_name: string | null;

  @ApiProperty({ example: true, description: 'True if review is from a customer who ordered this meal' })
  is_verified_purchase: boolean;

  @ApiProperty({ example: '2025-01-15T10:30:00Z' })
  created_at: Date;

  @ApiProperty({ example: '2025-01-15T10:30:00Z' })
  updated_at: Date;
}

export class CanReviewResponseDto {
  @ApiProperty({ example: true, description: 'Whether the user can review this menu item' })
  can_review: boolean;

  @ApiProperty({ example: 'You have already reviewed this item', nullable: true })
  reason: string | null;

  @ApiProperty({ example: false, description: 'Whether user has already reviewed this item' })
  has_reviewed: boolean;

  @ApiProperty({ example: true, description: 'Whether user has ordered this item with valid status' })
  has_ordered: boolean;
}

export class MenuItemReviewsResponseDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174001' })
  menu_item_id: string;

  @ApiProperty({ example: 'Doro Wat' })
  menu_item_name: string;

  @ApiProperty({ example: 4.5 })
  average_rating: number;

  @ApiProperty({ example: 127 })
  total_reviews: number;

  @ApiProperty({ 
    type: () => RatingDistributionDto,
    description: 'Count of reviews by rating (1-5 stars)'
  })
  rating_distribution: RatingDistributionDto;

  @ApiProperty({ type: [ReviewResponseDto] })
  reviews: ReviewResponseDto[];
}

export class RestaurantRatingResponseDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  restaurant_id: string;

  @ApiProperty({ example: 'Addis Kitchen' })
  restaurant_name: string;

  @ApiProperty({ example: 4.3 })
  average_rating: number;

  @ApiProperty({ example: 523 })
  total_reviews: number;

  @ApiProperty({ 
    type: () => RatingDistributionDto,
    description: 'Aggregated count of all meal reviews'
  })
  rating_distribution: RatingDistributionDto;
}
