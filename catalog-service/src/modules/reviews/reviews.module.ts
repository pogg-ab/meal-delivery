import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';
import { Review } from '../../entities/review.entity';
import { MenuItem } from '../../entities/menu-item.entity';
import { Order } from '../../entities/order.entity';
import { MenuCategory } from '../../entities/menu-category.entity';
import { Restaurant } from '../../entities/restaurant.entity';
import { KafkaProvider } from '../../providers/kafka.provider';
import { SharedModule } from '../../common/shared/shared.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Review, MenuItem, Order, MenuCategory, Restaurant]),
    SharedModule,
  ],
  controllers: [ReviewsController],
  providers: [ReviewsService, KafkaProvider],
  exports: [ReviewsService],
})
export class ReviewsModule {}
