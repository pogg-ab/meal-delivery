import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateCategoryDto } from './dto/create-category.dto';
import { MenuCategory } from '../../entities/menu-category.entity';
import { Restaurant } from '../../entities/restaurant.entity'; // Important for the ownership check
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(MenuCategory)
    private readonly categoryRepository: Repository<MenuCategory>,
    @InjectRepository(Restaurant) // Inject the Restaurant repository
    private readonly restaurantRepository: Repository<Restaurant>,
  ) {}

  async create(ownerId: string, createDto: CreateCategoryDto): Promise<MenuCategory> {
    // First, verify the restaurant exists
    const restaurant = await this.restaurantRepository.findOneBy({ id: createDto.restaurant_id });
    if (!restaurant) {
      throw new NotFoundException(`Restaurant with ID "${createDto.restaurant_id}" not found.`);
    }

    // CRITICAL: Verify the user owns this restaurant
    if (restaurant.owner_id !== ownerId) {
      throw new ForbiddenException('You do not have permission to add a category to this restaurant.');
    }

    // If checks pass, create and save the new category
    const newCategory = this.categoryRepository.create(createDto);
    return this.categoryRepository.save(newCategory);
  }
  async findAllByRestaurant(restaurantId: string): Promise<MenuCategory[]> {
  return this.categoryRepository.find({
    where: { restaurant_id: restaurantId, deleted_at: require('typeorm').IsNull() }, // Also filter out soft-deleted ones
    order: { name: 'ASC' },
  });
}
async update(
  ownerId: string,
  categoryId: string,
  updateDto: UpdateCategoryDto
): Promise<MenuCategory> {
  const category = await this.categoryRepository.findOne({
    where: { id: categoryId },
    relations: ['restaurant'],
  });

  if (!category) {
    throw new NotFoundException(`Category with ID "${categoryId}" not found.`);
  }
  
  if (category.restaurant.owner_id !== ownerId) {
    throw new ForbiddenException('You do not have permission to edit this category.');
  }

  Object.assign(category, updateDto);
  return this.categoryRepository.save(category);
}
async remove(ownerId: string, categoryId: string): Promise<void> {
  const category = await this.categoryRepository.findOne({
    where: { id: categoryId },
    relations: ['restaurant'],
  });

  if (!category) {
    throw new NotFoundException(`Category with ID "${categoryId}" not found.`);
  }
  
  if (category.restaurant.owner_id !== ownerId) {
    throw new ForbiddenException('You do not have permission to delete this category.');
  }

  await this.categoryRepository.softRemove(category);
}
}