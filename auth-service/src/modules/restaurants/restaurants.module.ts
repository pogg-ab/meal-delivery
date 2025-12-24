// auth-service/src/modules/restaurants/restaurants.module.ts

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RestaurantsService } from './restaurants.service';
import { RestaurantsController } from './restaurants.controller';

// Import all the entities this module will use
import { Restaurant } from '../../entities/restaurant.entity';
import { Address } from '../../entities/address.entity';
import { RestaurantHour } from '../../entities/restaurant-hour.entity';
import { RestaurantDocument } from 'src/entities/restaurant-document.entity';
import { RestaurantBankDetail } from 'src/entities/restaurant-bank-detail.entity';
import { UsersModule } from '../UserModule/user.module';
import { RolesModule } from '../RolesModule/roles.module';
import { SharedModule } from '../../common/shared/shared.module';

@Module({
  imports: [
    UsersModule,
    RolesModule,
    SharedModule,
    TypeOrmModule.forFeature([
      Restaurant,
      Address,
      RestaurantHour,
      RestaurantDocument,
      RestaurantBankDetail,
    ]),
  ],
  controllers: [RestaurantsController],
  providers: [RestaurantsService],
})
export class RestaurantsModule {}