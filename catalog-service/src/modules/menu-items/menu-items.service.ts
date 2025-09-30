import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateMenuItemDto } from './dto/create-menu-item.dto';
import { MenuItem } from '../../entities/menu-item.entity';
import { MenuCategory } from '../../entities/menu-category.entity';
import { Inventory } from '../../entities/inventory.entity';
import { UpdateMenuItemDto } from './dto/update-menu-item.dto';

@Injectable()
export class MenuItemsService {
  constructor(
    @InjectRepository(MenuItem)
    private readonly menuItemRepository: Repository<MenuItem>,
    @InjectRepository(MenuCategory)
    private readonly categoryRepository: Repository<MenuCategory>,
    @InjectRepository(Inventory)
    private readonly inventoryRepository: Repository<Inventory>,
  ) {}

  

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

  // --- THE FIX IS HERE ---
  const newMenuItem = this.menuItemRepository.create({
    ...createDto,
    is_available: false, // Always start as unavailable because stock is 0
  });
  // --- END OF FIX ---
  
  const savedMenuItem = await this.menuItemRepository.save(newMenuItem);

  const newInventory = this.inventoryRepository.create({
    menu_item_id: savedMenuItem.id,
    stock_quantity: 0,
    restaurant_id: category.restaurant.id,
  });
  await this.inventoryRepository.save(newInventory);

  return savedMenuItem;
}
  async findAllByRestaurant(restaurantId: string): Promise<MenuItem[]> {
  // We use QueryBuilder to join across multiple tables and filter effectively
  return this.menuItemRepository.createQueryBuilder('menuItem')
    .innerJoin('menuItem.category', 'category')
    .innerJoin('category.restaurant', 'restaurant')
    .where('restaurant.id = :restaurantId', { restaurantId })
    .andWhere('restaurant.is_active = :isActive', { isActive: true })
    .andWhere('menuItem.deleted_at IS NULL') // Exclude soft-deleted items
    .andWhere('category.deleted_at IS NULL') // Exclude items in soft-deleted categories
    .addSelect(['category.id', 'category.name']) // Include category info
    .getMany();
}

async update(
  ownerId: string,
  itemId: string,
  updateDto: UpdateMenuItemDto
): Promise<MenuItem> {
  // Use query builder to fetch the item and its restaurant owner in one go
  const menuItem = await this.menuItemRepository.createQueryBuilder('menuItem')
    .innerJoin('menuItem.category', 'category')
    .innerJoin('category.restaurant', 'restaurant')
    .addSelect('restaurant.owner_id')
    .where('menuItem.id = :itemId', { itemId })
    .getOne();

  if (!menuItem) {
    throw new NotFoundException(`Menu item with ID "${itemId}" not found.`);
  }
  
  // We don't have owner_id directly on menuItem, so we check through the relations
  // @ts-ignore - owner_id is not part of the MenuItem entity, but we selected it
  if (menuItem.category.restaurant.owner_id !== ownerId) {
    throw new ForbiddenException('You do not have permission to edit this item.');
  }
  
  Object.assign(menuItem, updateDto);
  return this.menuItemRepository.save(menuItem);
}

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