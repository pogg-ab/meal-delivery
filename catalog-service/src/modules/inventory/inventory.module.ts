import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventoryService } from './inventory.service';
import { InventoryConsumer } from './inventory.consumer';
import { Inventory } from '../../entities/inventory.entity';
import { InventoryLog } from '../../entities/inventory-log.entity';
import { MenuItem } from '../../entities/menu-item.entity';
import { InventoryController } from './inventory.controller';
import { Restaurant } from 'src/entities/restaurant.entity';
import { MenuCategory } from 'src/entities/menu-category.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Inventory,
      InventoryLog,
      MenuItem,
      Restaurant,
      MenuCategory
    ]),
  ],
  providers: [InventoryService],
  controllers: [InventoryConsumer, InventoryController], 
})
export class InventoryModule {}