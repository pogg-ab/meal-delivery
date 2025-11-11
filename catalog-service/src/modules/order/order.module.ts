import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from '../../entities/order.entity';
import { OrderItem } from '../../entities/order-items.entity';
import { OrderEvent } from '../../entities/order-event.entity';
import { MenuItem } from '../../entities/menu-item.entity';
import { Inventory } from '../../entities/inventory.entity';
import { InventoryLog } from '../../entities/inventory-log.entity';
import { Restaurant } from 'src/entities/restaurant.entity';
import { CustomerMenuRanking } from 'src/entities/customer-menu-ranking.entity';
import { OrdersService } from './order.service';
import { OrdersController } from './order.controller';
import { OrderGateway } from '../../gateways/order.gateway';
import { KafkaProvider } from '../../providers/kafka.provider';
import { OrderPickup } from 'src/entities/order-pickup.entity';
import { OrdersPickupService } from './order-pickup.service';
import { PromoCode } from 'src/entities/promo-code.entity';
import { PromoCodeService } from '../promos/promo.service';
import { MenuPersonalizationService } from '../menu-personalization/menu-personalization.service';


@Module({
imports: [TypeOrmModule.forFeature([Order, OrderItem, OrderPickup, OrderEvent, MenuItem, Inventory, InventoryLog, Restaurant, PromoCode, CustomerMenuRanking])],
providers: [
    OrdersService, 
    OrdersPickupService, 
    OrderGateway, 
    KafkaProvider, 
    PromoCodeService,
    MenuPersonalizationService 
],
controllers: [OrdersController],
exports: [OrdersService],
})
export class OrdersModule {}