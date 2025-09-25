import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventoryService } from './inventory.service';
import { InventoryConsumer } from './inventory.consumer';
import { Inventory } from '../../entities/inventory.entity';
import { InventoryLog } from '../../entities/inventory-log.entity';
import { MenuItem } from '../../entities/menu-item.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Inventory,
      InventoryLog,
      MenuItem,
    ]),
  ],
  providers: [InventoryService],
  controllers: [InventoryConsumer], 
})
export class InventoryModule {}