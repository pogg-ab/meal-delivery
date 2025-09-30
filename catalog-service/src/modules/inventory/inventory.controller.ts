// src/modules/inventory/inventory.controller.ts

import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { Inventory } from 'src/entities/inventory.entity'; // Import the entity
import { UpdateInventoryDto } from './dto/update-inventory.dto';
import { ReplenishInventoryDto } from './dto/replenish-inventory.dto';

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('restaurant/:restaurantId')
  async getInventoryForRestaurant(
    @Param('restaurantId', ParseUUIDPipe) restaurantId: string,
  ): Promise<Inventory[]> {
    return this.inventoryService.getInventoryForRestaurant(restaurantId);
  }

   @Put(':menuItemId')
  async updateStock(
    @Param('menuItemId', ParseUUIDPipe) menuItemId: string,
    @Body() updateInventoryDto: UpdateInventoryDto,
  ): Promise<Inventory> {
    return this.inventoryService.updateStockManually(
      menuItemId,
      updateInventoryDto.stock_quantity,
    );
  }
   @Post('replenish')
  async replenishStock(@Body() replenishInventoryDto: ReplenishInventoryDto) {
    return this.inventoryService.replenishStock(replenishInventoryDto.items);
  }
}