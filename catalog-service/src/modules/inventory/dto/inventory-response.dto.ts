import { ApiProperty } from '@nestjs/swagger';

export class MenuItemDto {
  @ApiProperty({ description: 'Menu item id', format: 'uuid', example: 'uuid-here' })
  id: string;

  @ApiProperty({ description: 'Name of the menu item', example: 'Classic Burger' })
  name: string;
}

export class InventoryDto {
  @ApiProperty({ description: 'Inventory id', format: 'uuid', example: 'uuid-here' })
  id: string;

  @ApiProperty({ description: 'Restaurant id', format: 'uuid', example: 'restaurant-uuid' })
  restaurant_id: string;

  @ApiProperty({ description: 'Menu item relation', type: MenuItemDto })
  menu_item: MenuItemDto;

  @ApiProperty({ description: 'Stock quantity', example: 5 })
  stock_quantity: number;
}
