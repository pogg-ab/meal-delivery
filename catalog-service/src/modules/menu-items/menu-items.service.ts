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
    // Step 1: Find the restaurant to get its name and confirm it exists.
    const restaurant = await this.restaurantRepository.findOneBy({ id: restaurantId });
    if (!restaurant) {
      throw new NotFoundException(`Restaurant with ID "${restaurantId}" not found`);
    }

    // Step 2: Use your existing query logic, but select only the fields needed for the DTO.
    const menuItems = await this.menuItemRepository.createQueryBuilder('menuItem')
      .innerJoin('menuItem.category', 'category')
      .where('category.restaurant_id = :restaurantId', { restaurantId })
      .andWhere('menuItem.deleted_at IS NULL') // Keep your existing filters
      .andWhere('category.deleted_at IS NULL')
      .select([
        'menuItem.id',
        'menuItem.name',
        'menuItem.price',
        'menuItem.is_available',
      ])
      .getMany();

    // Step 3: Build and return the new response object.
    return {
      restaurantId: restaurant.id,
      restaurantName: restaurant.name,
      menuItems: menuItems as any, // Cast is safe because we selected the exact properties
    };
  }

  // This method remains unchanged
  async update(ownerId: string, itemId: string, updateDto: UpdateMenuItemDto): Promise<MenuItem> {
    const menuItem = await this.menuItemRepository.createQueryBuilder('menuItem')
      .innerJoin('menuItem.category', 'category')
      .innerJoin('category.restaurant', 'restaurant')
      .addSelect('restaurant.owner_id')
      .where('menuItem.id = :itemId', { itemId })
      .getOne();

    if (!menuItem) {
      throw new NotFoundException(`Menu item with ID "${itemId}" not found.`);
    }
    
    // @ts-ignore
    if (menuItem.category.restaurant.owner_id !== ownerId) {
      throw new ForbiddenException('You do not have permission to edit this item.');
    }
    
    Object.assign(menuItem, updateDto);
    return this.menuItemRepository.save(menuItem);
  }

  // This method remains unchanged
  async remove(ownerId: string, itemId: string): Promise<void> {
    const menuItem = await this.menuItemRepository.createQueryBuilder('menuItem')
      .innerJoin('menuItem.category', 'category')
      .innerJoin('category.restaurant', 'restaurant')
      .addSelect('restaurant.owner_id')
      .where('menuItem.id = :itemId', { itemId })
      .getOne();

    if (!menuItem) {
      throw new NotFoundException(`Menu item with ID "${itemId}" not found.`);
    }
    
    // @ts-ignore
    if (menuItem.category.restaurant.owner_id !== ownerId) {
      throw new ForbiddenException('You do not have permission to delete this item.');
    }

    await this.menuItemRepository.softRemove(menuItem);
  }
}