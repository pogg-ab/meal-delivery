import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from '../../entities/order.entity';
import { OrderItem } from '../../entities/order-items.entity';
import { OrderEvent } from '../../entities/order-event.entity';
import { MenuItem } from '../../entities/menu-item.entity';
import { Inventory } from '../../entities/inventory.entity';
import { InventoryLog } from '../../entities/inventory-log.entity';
import { Restaurant } from 'src/entities/restaurant.entity';
import { OrdersService } from './order.service';
import { OrdersController } from './order.controller';
import { OrderGateway } from '../../gateways/order.gateway';
import { KafkaProvider } from '../../providers/kafka.provider';
import { OrderPickup } from 'src/entities/order-pickup.entity';
import { OrdersPickupService } from './order-pickup.service';
import { PromoCode } from 'src/entities/promo-code.entity';
import { PromoCodeService } from '../promos/promo.service';

@Module({
imports: [TypeOrmModule.forFeature([Order, OrderItem, OrderPickup, OrderEvent, MenuItem, Inventory, InventoryLog, Restaurant, PromoCode])],
providers: [OrdersService, OrdersPickupService, OrderGateway, KafkaProvider, PromoCodeService],
controllers: [OrdersController],
exports: [OrdersService],
})
export class OrdersModule {}