// src/modules/menu-items/dto/restaurant-menu.dto.ts
import { ApiProperty } from '@nestjs/swagger';

class MenuItemInfo {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  price: number;
  
  @ApiProperty()
  is_available: boolean;
}

export class RestaurantMenuResponseDto {
  @ApiProperty()
  restaurantId: string;

  @ApiProperty()
  restaurantName: string;
  
  @ApiProperty({ type: [MenuItemInfo] })
  menuItems: MenuItemInfo[];
}