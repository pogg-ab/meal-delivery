import { Controller, Post, Body, UseGuards, Req, Get, Param, Put, Delete, HttpCode, HttpStatus } from '@nestjs/common';
import { MenuItemsService } from './menu-items.service';
import { CreateMenuItemDto } from './dto/create-menu-item.dto';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { UpdateMenuItemDto } from './dto/update-menu-item.dto';
@ApiTags('Menu Items')
@Controller('menu-items')
export class MenuItemsController {
  constructor(private readonly menuItemsService: MenuItemsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Create a new menu item (Owner only)' })
  create(@Body() createMenuItemDto: CreateMenuItemDto, @Req() req) {
    const ownerId = req.user.userId;
    return this.menuItemsService.create(ownerId, createMenuItemDto);
  }
  @Get('/restaurant/:restaurantId')
@ApiOperation({ summary: 'Fetch all public menu items for a restaurant' })
findAllByRestaurant(@Param('restaurantId') restaurantId: string) {
  return this.menuItemsService.findAllByRestaurant(restaurantId);
}
@Put(':id')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
@ApiOperation({ summary: 'Update a menu item (Owner only)' })
update(
  @Param('id') itemId: string,
  @Body() updateDto: UpdateMenuItemDto,
  @Req() req,
) {
  const ownerId = req.user.userId;
  return this.menuItemsService.update(ownerId, itemId, updateDto);
}
@Delete(':id')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
@ApiOperation({ summary: 'Delete a menu item (Owner only)' })
@HttpCode(HttpStatus.NO_CONTENT)
remove(@Param('id') itemId: string, @Req() req) {
  const ownerId = req.user.userId;
  return this.menuItemsService.remove(ownerId, itemId);
}
}