import { Controller, Post, Body, UseGuards, Req, Get, Param, Put, Delete, HttpCode, HttpStatus } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
// This assumes you have a JwtAuthGuard in your catalog-service.
// If not, we'll need to create a simple one.
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'; 
import { UpdateCategoryDto } from './dto/update-category.dto';

@ApiTags('Menu Categories')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Create a new menu category (Owner only)' })
  create(
    @Body() createCategoryDto: CreateCategoryDto,
    @Req() req,
  ) {
    // We'll get the authenticated user's ID from the token payload
    const ownerId = req.user.userId; 
    return this.categoriesService.create(ownerId, createCategoryDto);
  }

  @Get('/restaurant/:restaurantId')
@ApiOperation({ summary: 'Fetch all categories for a specific restaurant' })
findAllByRestaurant(@Param('restaurantId') restaurantId: string) {
  return this.categoriesService.findAllByRestaurant(restaurantId);
}
@Put(':id')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
@ApiOperation({ summary: 'Update a menu category (Owner only)' })
update(
  @Param('id') categoryId: string,
  @Body() updateDto: UpdateCategoryDto,
  @Req() req,
) {
  const ownerId = req.user.userId;
  return this.categoriesService.update(ownerId, categoryId, updateDto);
}
@Delete(':id')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
@ApiOperation({ summary: 'Delete a menu category (Owner only)' })
@HttpCode(HttpStatus.NO_CONTENT)
remove(@Param('id') categoryId: string, @Req() req) {
  const ownerId = req.user.userId;
  return this.categoriesService.remove(ownerId, categoryId);
}
}