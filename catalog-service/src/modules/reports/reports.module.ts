import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Inventory } from 'src/entities/inventory.entity';
import { Order } from 'src/entities/order.entity';
import { MenuInventoryHistory } from 'src/entities/menu-inventory.entity';
import { InventoryLog } from 'src/entities/inventory-log.entity';
import { MenuItem } from 'src/entities/menu-item.entity';
import { Restaurant } from 'src/entities/restaurant.entity'; // <-- 1. IMPORT THE RESTAURANT ENTITY

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Inventory,
      Order,
      MenuInventoryHistory,
      InventoryLog,
      MenuItem,
      Restaurant, // <-- 2. ADD THE RESTAURANT ENTITY HERE
    ]),
  ],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
