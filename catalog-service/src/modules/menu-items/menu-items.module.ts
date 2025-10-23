import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MenuItemsService } from './menu-items.service';
import { MenuItemsController } from './menu-items.controller';
import { MenuItem } from '../../entities/menu-item.entity';
import { MenuCategory } from '../../entities/menu-category.entity';
import { Inventory } from '../../entities/inventory.entity';
import { Restaurant } from 'src/entities/restaurant.entity';



@Module({
  imports: [
    TypeOrmModule.forFeature([
      MenuItem,
      MenuCategory,
      Inventory,
      Restaurant,
    ]),
  ],
  controllers: [MenuItemsController],
  providers: [MenuItemsService],
})
export class MenuItemsModule {}