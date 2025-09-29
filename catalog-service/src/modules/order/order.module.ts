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


@Module({
imports: [TypeOrmModule.forFeature([Order, OrderItem, OrderEvent, MenuItem, Inventory, InventoryLog,Restaurant])],
providers: [OrdersService, OrderGateway, KafkaProvider ],
controllers: [OrdersController],
exports: [OrdersService],
})
export class OrdersModule {}