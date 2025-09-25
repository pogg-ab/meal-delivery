import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Restaurant } from '../../entities/restaurant.entity';
import { RestaurantsConsumer } from './restaurants.consumer';

@Module({
  imports: [TypeOrmModule.forFeature([Restaurant])],
  controllers: [RestaurantsConsumer], // Register the consumer
})
export class RestaurantsModule {}