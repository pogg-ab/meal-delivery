import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateMenuItemDto } from './dto/create-menu-item.dto';
import { MenuItem } from '../../entities/menu-item.entity';
import { MenuCategory } from '../../entities/menu-category.entity';
import { Inventory } from '../../entities/inventory.entity';
import { UpdateMenuItemDto } from './dto/update-menu-item.dto';

// --- CHANGES START HERE ---
import { Restaurant } from '../../entities/restaurant.entity'; // 1. IMPORT Restaurant entity
import { RestaurantMenuResponseDto } from './dto/restaurant-menu.dto'; // 2. IMPORT the new DTO
// --- CHANGES END HERE ---

@Injectable()
export class MenuItemsService {
  constructor(
    @InjectRepository(MenuItem)
    private readonly menuItemRepository: Repository<MenuItem>,
    @InjectRepository(MenuCategory)
    private readonly categoryRepository: Repository<MenuCategory>,
    @InjectRepository(Inventory)
    private readonly inventoryRepository: Repository<Inventory>,
    // --- CHANGE START HERE ---
    @InjectRepository(Restaurant) // 3. INJECT the Restaurant repository
    private readonly restaurantRepository: Repository<Restaurant>,
    // --- CHANGE END HERE ---
  ) {}

  // This method remains unchanged
  async create(ownerId: string, createDto: CreateMenuItemDto): Promise<MenuItem> {
    const category = await this.categoryRepository.findOne({
      where: { id: createDto.category_id },
      relations: ['restaurant'],
    });

    if (!category) {
      throw new NotFoundException(`Menu category with ID "${createDto.category_id}" not found.`);
    }

    if (category.restaurant.owner_id !== ownerId) {
      throw new ForbiddenException('You do not have permission to add items to this category.');
    }

    const newMenuItem = this.menuItemRepository.create({
      ...createDto,
      is_available: false, 
    });
    
    const savedMenuItem = await this.menuItemRepository.save(newMenuItem);

    const newInventory = this.inventoryRepository.create({
      menu_item_id: savedMenuItem.id,
      stock_quantity: 0,
      restaurant_id: category.restaurant.id,
    });
    await this.inventoryRepository.save(newInventory);

    return savedMenuItem;
  }

  // --- THIS IS THE METHOD WE ARE REFACTORING ---
 async findAllByRestaurant(restaurantId: string): Promise<RestaurantMenuResponseDto> {
  const restaurant = await this.restaurantRepository.findOneBy({ id: restaurantId });
  if (!restaurant) {
    throw new NotFoundException(`Restaurant with ID "${restaurantId}" not found`);
  }

  const menuItemsWithCategory = await this.menuItemRepository.createQueryBuilder('menuItem')
    .innerJoin('menuItem.category', 'category')
    .where('category.restaurant_id = :restaurantId', { restaurantId })
    .andWhere('menuItem.deleted_at IS NULL')
    .andWhere('category.deleted_at IS NULL')
    .select([
      'menuItem.id',
      'menuItem.name',
      'menuItem.description', // <-- 1. Select the description
      'menuItem.image_url',
      'menuItem.price',
      'menuItem.is_available',
      'menuItem.average_rating',
      'menuItem.total_reviews',
      'category.id',
      'category.name',
    ])
    .getMany();

  const formattedMenuItems = menuItemsWithCategory.map(item => ({
    id: item.id,
    name: item.name,
    description: item.description, // <-- 2. Map the description
    image_url: item.image_url,
    price: item.price.toString(),
    is_available: item.is_available,
    average_rating: item.average_rating,
    total_reviews: item.total_reviews,
    categoryId: item.category.id,
    categoryName: item.category.name,
  }));

  return {
    restaurantId: restaurant.id,
    restaurantName: restaurant.name,
    restaurantRating: restaurant.average_rating,
    restaurantTotalReviews: restaurant.total_reviews,
    menuItems: formattedMenuItems,
  };
}

  // This method remains unchanged
   async update(ownerId: string, itemId: string, updateDto: UpdateMenuItemDto): Promise<MenuItem> {
    const menuItem = await this.menuItemRepository.createQueryBuilder('menuItem')
      .innerJoinAndSelect('menuItem.category', 'category')
      .innerJoinAndSelect('category.restaurant', 'restaurant')
      .where('menuItem.id = :itemId', { itemId })
      .getOne();

    if (!menuItem) {
      throw new NotFoundException(`Menu item with ID "${itemId}" not found.`);
    }
    
    if (menuItem.category.restaurant.owner_id !== ownerId) {
      throw new ForbiddenException('You do not have permission to edit this item.');
    }
    
    Object.assign(menuItem, updateDto);
    return this.menuItemRepository.save(menuItem);
  }

  // This method remains unchanged
  async remove(ownerId: string, itemId: string): Promise<void> {
    const menuItem = await this.menuItemRepository.createQueryBuilder('menuItem')
      .innerJoinAndSelect('menuItem.category', 'category')
      .innerJoinAndSelect('category.restaurant', 'restaurant')
      .where('menuItem.id = :itemId', { itemId })
      .getOne();

    if (!menuItem) {
      throw new NotFoundException(`Menu item with ID "${itemId}" not found.`);
    }
    
    if (menuItem.category.restaurant.owner_id !== ownerId) {
      throw new ForbiddenException('You do not have permission to delete this item.');
    }

    await this.menuItemRepository.softRemove(menuItem);
  }

}
