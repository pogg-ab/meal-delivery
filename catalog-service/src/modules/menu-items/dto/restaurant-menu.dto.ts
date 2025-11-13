import { ApiProperty } from '@nestjs/swagger';

class MenuItemInfo {
  @ApiProperty({ example: '11b7dad9-673c-4b52-9228-7ddd868f4a17' })
  id: string;

  @ApiProperty({ example: 'Doro Wet' })
  name: string;

  @ApiProperty({ example: '250.00' })
  price: string; // Your entity uses a string for price, so we'll match that
  
  @ApiProperty({ example: false })
  is_available: boolean;

  @ApiProperty({ example: 4.5, nullable: true, required: false })
  average_rating?: number | null;

  @ApiProperty({ example: 127, required: false })
  total_reviews?: number;

  // --- CHANGES START HERE ---
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-1234-567890abcdef' })
  categoryId: string;

  @ApiProperty({ example: 'Main Dishes' })
  categoryName: string;
  // --- CHANGES END HERE ---
}

export class RestaurantMenuResponseDto {
  @ApiProperty({ example: 'cb52303b-4ec7-452f-8570-25d8b37396c4' })
  restaurantId: string;

  @ApiProperty({ example: "Mel's Place" })
  restaurantName: string;

  @ApiProperty({ example: 4.3, nullable: true, required: false })
  restaurantRating?: number | null;

  @ApiProperty({ example: 523, required: false })
  restaurantTotalReviews?: number;
  
  @ApiProperty({ type: [MenuItemInfo] })
  menuItems: MenuItemInfo[];
}
