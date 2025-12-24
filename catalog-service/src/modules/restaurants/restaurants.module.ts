import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RestaurantsConsumer } from './restaurants.consumer';
import { MenuCategory } from '../../entities/menu-category.entity';
import { Restaurant } from '../../entities/restaurant.entity';
import { MenuItem } from '../../entities/menu-item.entity';
import { RestaurantsService } from './restaurants.service';
import { RestaurantsController } from './restaurants.controller';


@Module({
  imports: [TypeOrmModule.forFeature([Restaurant, MenuItem, MenuCategory])],
  controllers: [RestaurantsConsumer, RestaurantsController], // Register the consumer
  providers: [RestaurantsService],
})
export class RestaurantsModule {}