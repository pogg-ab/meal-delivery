
import {
  Body,
  Controller,
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
  @ApiOperation({ summary: 'Manually update stock quantity for a menu item (owner only)' })
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
      updateInventoryDto.stock_quantity,
      userId,
    );
  }

  @Post('replenish')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Replenish inventory in bulk (owner only)' })
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
  @Post('test/trigger-low-stock-check')
@ApiExcludeEndpoint() // Hide from public docs
async triggerLowStockCheck() {
    // We are just manually calling the cron job's method
    this.inventoryService.handleLowStockCheck(); 
    return { message: "Low-stock check has been triggered successfully." };
}
}
