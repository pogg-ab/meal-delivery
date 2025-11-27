import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';


import { Order } from '../../entities/order.entity';
import { Restaurant } from '../../entities/restaurant.entity';


import { RestaurantOwnershipGuard } from '../../common/guards/restaurant-ownership.guard';
import { SharedModule } from 'src/common/shared/shared.module';
import { MenuItem } from 'src/entities/menu-item.entity';
import { OrderItem } from 'src/entities/order-items.entity';
import { OrderEvent } from 'src/entities/order-event.entity';

@Module({
  imports: [
    
    TypeOrmModule.forFeature([Order, Restaurant, OrderItem,
      MenuItem, OrderEvent,]),

    
    SharedModule,
  ],
  controllers: [AnalyticsController],
  providers: [
    AnalyticsService,
  
    RestaurantOwnershipGuard,
  ],
})
export class AnalyticsModule {}