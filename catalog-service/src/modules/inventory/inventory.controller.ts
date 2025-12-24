
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { Inventory } from 'src/entities/inventory.entity';
import { UpdateInventoryDto } from './dto/update-inventory.dto';
import { ReplenishInventoryDto } from './dto/replenish-inventory.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiOkResponse, ApiBody, ApiParam, ApiExtraModels, ApiForbiddenResponse, ApiUnauthorizedResponse, ApiNotFoundResponse, ApiExcludeEndpoint } from '@nestjs/swagger';
import { ReplenishResponseDto } from './dto/replenish-response.dto';
import { InventoryDto } from './dto/inventory-response.dto';
import { UserId } from '../../common/decorator/user-id.decorator';
import { SetParLevelDto } from './dto/set-par-level.dto';
import { BulkSetParLevelDto } from './dto/bulk-set-par-level.dto';

@ApiTags('inventory')
@ApiBearerAuth()
@ApiExtraModels(InventoryDto, ReplenishResponseDto)
@UseGuards(JwtAuthGuard)
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('restaurant/:restaurantId')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get inventory items for a restaurant (owner only)' })
  @ApiParam({ name: 'restaurantId', description: 'Restaurant UUID', format: 'uuid' })
  @ApiOkResponse({ description: 'List of inventory items', type: InventoryDto, isArray: true })
  @ApiUnauthorizedResponse({ description: 'Unauthorized. Missing or invalid JWT token.' })
  @ApiForbiddenResponse({ description: 'You do not belong to this restaurant.' })
  @ApiNotFoundResponse({ description: 'Restaurant not found.' })
  async getInventoryForRestaurant(
    @Param('restaurantId', ParseUUIDPipe) restaurantId: string,
    @UserId() userId: string,
  ): Promise<Inventory[]> {
    return this.inventoryService.getInventoryForRestaurant(restaurantId, userId);
  }

  @Put(':menuItemId')
  @ApiBearerAuth('access-token')
  // --- UPDATE: Description is now more accurate ---
  @ApiOperation({ summary: 'Manually add stock to a menu item (owner only)' })
  @ApiParam({ name: 'menuItemId', description: 'Menu item UUID', format: 'uuid' })
  @ApiBody({ type: UpdateInventoryDto })
  @ApiOkResponse({ description: 'Updated inventory item', type: InventoryDto })
  @ApiUnauthorizedResponse({ description: 'Unauthorized. Missing or invalid JWT token.' })
  @ApiForbiddenResponse({ description: 'You do not belong to this restaurant.' })
  @ApiNotFoundResponse({ description: 'Menu item or restaurant not found.' })
  async updateStock(
    @Param('menuItemId', ParseUUIDPipe) menuItemId: string,
    @Body() updateInventoryDto: UpdateInventoryDto,
    @UserId() userId: string,
  ): Promise<Inventory> {
    return this.inventoryService.updateStockManually(
      menuItemId,
      // --- THIS IS THE FIX ---
      // We use 'stock_quantity' as defined in your DTO.
      updateInventoryDto.stock_quantity,
      userId,
    );
  }

   @Post('replenish')
  @ApiBearerAuth('access-token')
  // --- UPDATE: Description is now more accurate ---
  @ApiOperation({ summary: 'Add stock to inventory in bulk (owner only)' })
  @ApiBody({ type: ReplenishInventoryDto })
  @ApiOkResponse({ description: 'Replenish result', type: ReplenishResponseDto })
  @ApiUnauthorizedResponse({ description: 'Unauthorized. Missing or invalid JWT token.' })
  @ApiForbiddenResponse({ description: 'You do not belong to one or more restaurants.' })
  @ApiNotFoundResponse({ description: 'One or more menu items or restaurants not found.' })
  async replenishStock(
    @Body() replenishInventoryDto: ReplenishInventoryDto,
    @UserId() userId: string,
  ) {
    return this.inventoryService.replenishStock(replenishInventoryDto.items, userId);
  }

   @Post('par-levels') 
   @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Set or update daily reset levels for multiple menu items (owner only)' })
  @ApiBody({ type: BulkSetParLevelDto })
  @ApiOkResponse({ description: 'The par levels were set successfully.' })
  async setParLevels(
    @Body() bulkSetParLevelDto: BulkSetParLevelDto,
    @UserId() userId: string,
  ) {
    return this.inventoryService.bulkSetParLevels(bulkSetParLevelDto.items, userId);
  }

  @Get('par-level/restaurant/:restaurantId')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get all configured daily reset levels for a restaurant (owner only)' })
  @ApiParam({ name: 'restaurantId', description: 'Restaurant UUID', format: 'uuid' })
  @ApiOkResponse({ description: 'A list of configured par levels.' })
  async getParLevelsForRestaurant(
    @Param('restaurantId', ParseUUIDPipe) restaurantId: string,
    @UserId() userId: string,
  ) {
    return this.inventoryService.getParLevelsForRestaurant(restaurantId, userId);
  }

  @Delete('par-level/:menuItemId')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Remove a daily reset level for a menu item (owner only)' })
  @ApiParam({ name: 'menuItemId', description: 'Menu item UUID', format: 'uuid' })
  @ApiOkResponse({ description: 'The par level was removed successfully.' })
  async removeParLevel(
    @Param('menuItemId', ParseUUIDPipe) menuItemId: string,
    @UserId() userId: string,
  ) {
    return this.inventoryService.removeParLevel(menuItemId, userId);
  }

}
