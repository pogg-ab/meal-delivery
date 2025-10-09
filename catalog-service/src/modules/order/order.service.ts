
import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, DeepPartial } from 'typeorm';
import { Order } from '../../entities/order.entity';
import { OrderItem } from '../../entities/order-items.entity';
import { OrderEvent } from '../../entities/order-event.entity';
import { OrderStatus } from '../../entities/enums/order-status.enum';
import { PaymentStatus } from '../../entities/enums/payment-status.enum';
import { MenuItem } from '../../entities/menu-item.entity';
import { Restaurant } from '../../entities/restaurant.entity';
import { OrderGateway } from '../../gateways/order.gateway';
import { KafkaProvider } from 'src/providers/kafka.provider';
import { CreateOrderDto } from './dtos/create-order.dto';
import { CancelOrderDto } from './dtos/cancel-order.dto';
import { OwnerPreparingDto } from './dtos/owner-preparing.dto';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
    @InjectRepository(OrderItem) private readonly orderItemRepo: Repository<OrderItem>,
    @InjectRepository(MenuItem) private readonly menuItemRepo: Repository<MenuItem>,
    @InjectRepository(Restaurant) private readonly restaurantRepo: Repository<Restaurant>,
    private readonly dataSource: DataSource,
    private readonly gateway: OrderGateway,
    private readonly kafka: KafkaProvider,
  ) {}

  /**
   * Create order. Since inventory is NOT tracked (per your decision),
   * we only validate menu item availability (is_available) and snapshot prices/quantities.
   */
  // In catalog-service/src/modules/orders/orders.service.ts

  async createOrder(customerId: string, dto: CreateOrderDto): Promise<Order> {
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('Order must contain at least one item.');
    }

    return await this.dataSource.transaction(async (manager) => {
      // Get repositories from the transaction manager
      const orderRepo = manager.getRepository(Order);
      const orderItemRepo = manager.getRepository(OrderItem);
      const menuRepo = manager.getRepository(MenuItem);
      const orderEventRepo = manager.getRepository(OrderEvent);
      const restaurantRepo = manager.getRepository(Restaurant); // <-- Added

      // --- START: MODIFICATION FOR OWNER NOTIFICATION ---
      // 1. Find the restaurant to get the owner's ID for the Kafka event.
      const restaurant = await restaurantRepo.findOne({ where: { id: dto.restaurant_id } });
      if (!restaurant) {
        throw new NotFoundException(`Restaurant with ID ${dto.restaurant_id} not found.`);
      }
      const ownerId = restaurant.owner_id;
      // --- END: MODIFICATION FOR OWNER NOTIFICATION ---

      let total = 0;
      type PreparedItem = { 
        menu_id: string; 
        name: string; 
        unit_price: number; 
        qty: number; 
        subtotal: number; 
        instructions?: string 
      };
      const preparedItems: PreparedItem[] = [];

      // Validate all menu items and compute totals.
      for (const it of dto.items) {
        const menuItem = await menuRepo.findOne({ where: { id: it.menu_item_id } });
        if (!menuItem) {
          throw new NotFoundException(`Menu item not found: ${it.menu_item_id}`);
        }
        if (!menuItem.is_available) {
          throw new BadRequestException(`Item not available: ${menuItem.name}`);
        }

        const quantity = Number(it.quantity ?? 1);
        const subtotal = Number(menuItem.price) * quantity;
        total += subtotal;

        preparedItems.push({
          menu_id: menuItem.id,
          name: menuItem.name,
          unit_price: Number(menuItem.price),
          qty: quantity,
          subtotal,
          instructions: it.instructions,
        });
      }

      // Create the main order record.
      const orderData: DeepPartial<Order> = {
        customer_id: customerId,
        restaurant_id: dto.restaurant_id,
        total_amount: total,
        currency: dto.currency ?? 'USD',
        instructions: dto.instructions,
        is_delivery: !!dto.is_delivery,
        status: OrderStatus.PENDING,
        payment_status: PaymentStatus.NONE,
      };
      const orderEntity = orderRepo.create(orderData);
      const savedOrder = await orderRepo.save(orderEntity);

      // Create the associated order item records.
      for (const p of preparedItems) {
        const itemData: DeepPartial<OrderItem> = {
          order_id: savedOrder.id,
          menu_item_id: p.menu_id,
          name: p.name,
          unit_price: p.unit_price,
          quantity: p.qty,
          subtotal: p.subtotal,
          instructions: p.instructions,
        };
        const itemEntity = orderItemRepo.create(itemData as any);
        await orderItemRepo.save(itemEntity);
      }

      // Record the 'ORDER_CREATED' event for auditing.
      await orderEventRepo.save(
        orderEventRepo.create({
          order_id: savedOrder.id,
          actor_id: customerId,
          action: 'ORDER_CREATED',
          meta: { items: dto.items },
        } as DeepPartial<OrderEvent>),
      );

      // Fetch the full order with its items to return.
      const fullOrder = await orderRepo.findOne({ where: { id: savedOrder.id }, relations: ['items'] });
      if (!fullOrder) {
        throw new NotFoundException('Order not found after creation');
      }

      // Notify connected clients via WebSocket.
      this.gateway.emitOrderCreated(fullOrder);

      // Publish the enriched event to Kafka for other microservices.
      try {
        // --- START: MODIFICATION FOR OWNER NOTIFICATION ---
        // 2. Create an enriched payload that includes the ownerId.
        const eventPayload = {
          ...fullOrder,
          ownerId: ownerId, 
        };
        await this.kafka.emit('order.created', eventPayload);
        this.logger.log(`Emitted order.created event for order ${fullOrder.id} to owner ${ownerId}`);
        // --- END: MODIFICATION FOR OWNER NOTIFICATION ---
      } catch (e) {
        this.logger.warn('Kafka emit failed for order.created', e as any);
      }

      return fullOrder;
    });
  }

  /**
   * Owner responds to an order. Emits 'order.awaiting_payment' when accepted.
   */
async ownerResponse(ownerId: string, orderId: string, accepted: boolean, reason?: string) {
  const order = await this.orderRepo.findOne({ where: { id: orderId }, relations: ['restaurant', 'items'] });
  if (!order) throw new NotFoundException('Order not found');
  if (!order.restaurant || order.restaurant.owner_id !== ownerId) throw new BadRequestException('Not authorized');

  // --- THIS IS THE CRITICAL FIX ---
  // 1. Add a state check. Only allow this action if the order is PENDING.
  if (order.status !== OrderStatus.PENDING) {
    throw new BadRequestException('This order has already been processed and cannot be changed.');
  }
  // --- END OF FIX ---

  order.status = accepted ? OrderStatus.ACCEPTED : OrderStatus.DECLINED;
  await this.orderRepo.save(order);

  await this.orderRepo.manager.getRepository(OrderEvent).save(
    this.orderRepo.manager.getRepository(OrderEvent).create({
      order_id: order.id,
      actor_id: ownerId,
      action: accepted ? 'OWNER_ACCEPTED' : 'OWNER_DECLINED',
      meta: reason ? { reason } : undefined,
    } as DeepPartial<OrderEvent>),
  );

  this.gateway.emitOrderUpdated(order);

  if (accepted) {
    // This logic now only runs ONCE, when the order is accepted from a PENDING state.
    const confirmedOrderPayload = {
      orderId: order.id,
      userId: order.customer_id, // For notification-service
      restaurantName: order.restaurant.name, // For notification-service
      items: order.items.map(item => ({ // For inventory-service
        menuItemId: item.menu_item_id,
        quantity: item.quantity,
      })),
    };
    try {
      await this.kafka.emit('order.confirmed', confirmedOrderPayload);
      this.logger.log(`Published order.confirmed event for order ${order.id}`);
    } catch (e) {
      this.logger.warn('Kafka emit failed for order.confirmed', e as any);
    }

    // 2. Ask Payment service to start payment flow (your existing logic)
    const paymentPayload = {
      order_id: order.id,
      amount: Number(order.total_amount),
      currency: order.currency,
      customer_id: order.customer_id,
      restaurant_id: order.restaurant_id,
    };
    try {
      await this.kafka.emit('order.awaiting_payment', paymentPayload);
    } catch (e) {
      this.logger.warn('Kafka emit failed for order.awaiting_payment', e as any);
    }

    order.status = OrderStatus.AWAITING_PAYMENT;
    await this.orderRepo.save(order);
    this.gateway.emitOrderUpdated(order);
  }

  return { ok: true };
}

  /**
   * Handle payment result events (payment.success / payment.failed).
   * Since items are not inventory-tracked, we simply mark order as paid or failed and emit order.paid
   * (so other services/UI can react).
   */
  async handlePaymentResult(payload: any) {
    this.logger.log(`handlePaymentResult: ${JSON.stringify(payload)}`);
    const order = await this.orderRepo.findOne({ where: { id: payload.order_id }, relations: ['items', 'restaurant'] });
    if (!order) {
      this.logger.warn(`Order not found for payment result: ${payload.order_id}`);
      return;
    }

    if (payload.status === 'SUCCESS' || payload.status === 'PAID') {
      order.payment_status = PaymentStatus.PAID;
      order.payment_reference = payload.reference ?? payload.payment_reference ?? null;
      order.paid_at = payload.paid_at ? new Date(payload.paid_at) : new Date();

      // advance order state
      order.status = OrderStatus.PAID;
      await this.orderRepo.save(order);

      await this.orderRepo.manager.getRepository(OrderEvent).save(
        this.orderRepo.manager.getRepository(OrderEvent).create({
          order_id: order.id,
          action: 'PAYMENT_CONFIRMED',
          meta: payload,
        } as DeepPartial<OrderEvent>),
      );

      // NO inventory deduction emitted
      try {
        await this.kafka.emit('order.paid', { order_id: order.id, paid_at: order.paid_at });
      } catch (e) {
        this.logger.warn('Kafka emit failed for order.paid', e as any);
      }

      this.gateway.emitOrderUpdated(order);
      return;
    }

    // payment failed
    order.payment_status = PaymentStatus.FAILED;
    order.status = OrderStatus.DECLINED;
    await this.orderRepo.save(order);

    await this.orderRepo.manager.getRepository(OrderEvent).save(
      this.orderRepo.manager.getRepository(OrderEvent).create({
        order_id: order.id,
        action: 'PAYMENT_FAILED',
        meta: payload,
      } as DeepPartial<OrderEvent>),
    );

    this.gateway.emitOrderUpdated(order);
  }

  /**
   * Customer marks "coming".
   */
  async markCustomerComing(customerId: string, orderId: string, note?: string) {
    const order = await this.orderRepo.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.customer_id !== customerId) throw new BadRequestException('Not your order');

    order.status = OrderStatus.CUSTOMER_COMING;
    await this.orderRepo.save(order);

    await this.orderRepo.manager.getRepository(OrderEvent).save(
      this.orderRepo.manager.getRepository(OrderEvent).create({
        order_id: order.id,
        actor_id: customerId,
        action: 'CUSTOMER_COMING',
        meta: note ? { note } : undefined,
      } as DeepPartial<OrderEvent>),
    );

    this.gateway.emitOrderUpdated(order);
    return { ok: true };
  }

  async getOrderById(orderId: string) {
    const order = (await this.orderRepo.findOne({ where: { id: orderId }, relations: ['items', 'events', 'restaurant'] })) as Order | null;
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

async getOrdersByCustomer(customerId: string, limit = 50, offset = 0) {
    const take = Math.max(1, Math.min(limit, 100));
    const skip = Math.max(0, offset);

    const orders = await this.orderRepo.find({
      where: { customer_id: customerId },
      relations: ['items', 'events', 'restaurant'],
      order: { created_at: 'DESC' },
      take,
      skip,
    });
    return orders;
  }

async getOrdersByRestaurant(ownerId: string, restaurantId: string, limit = 50, offset = 0) {
  // verify restaurant exists and owner
  const restaurant = await this.restaurantRepo.findOne({ where: { id: restaurantId } });
  if (!restaurant) throw new NotFoundException('Restaurant not found');
  if (restaurant.owner_id !== ownerId) throw new BadRequestException('Not authorized');

  const take = Math.max(1, Math.min(limit, 100));
  const skip = Math.max(0, offset);

  const orders = await this.orderRepo.find({
    where: { restaurant_id: restaurantId },
    relations: ['items', 'events', 'restaurant'],
    order: { created_at: 'DESC' },
    take,
    skip,
  });
  return orders;
 }
  async toggleMenuAvailability(ownerId: string, restaurantId: string, menuItemId: string, is_available: boolean) {
    // verify restaurant ownership
    const restaurant = await this.restaurantRepo.findOne({ where: { id: restaurantId } });
    if (!restaurant) throw new NotFoundException('Restaurant not found');
    if (restaurant.owner_id !== ownerId) throw new BadRequestException('Not authorized');

    // verify menu item belongs to restaurant.
    // menu items belong to a category which belongs to a restaurant.
    const menu = await this.menuItemRepo.findOne({
      where: { id: menuItemId },
      relations: ['category', 'category.restaurant'],
    });

    if (!menu) throw new NotFoundException('Menu item not found');

    const belongsToRestaurant =
      menu.category && (menu.category as any).restaurant && ((menu.category as any).restaurant.id === restaurantId || (menu.category as any).restaurant.restaurant_id === restaurantId);

    if (!belongsToRestaurant) {
      throw new NotFoundException('Menu item not found for this restaurant');
    }

    menu.is_available = !!is_available;
    await this.menuItemRepo.save(menu);

    // create event WITHOUT order_id (not related to a specific order)
    await this.orderRepo.manager.getRepository(OrderEvent).save(
      this.orderRepo.manager.getRepository(OrderEvent).create({
        // don't set order_id when there is none
        actor_id: ownerId,
        action: 'MENU_AVAILABILITY_UPDATED',
        meta: { menu_item_id: menuItemId, is_available },
      } as DeepPartial<OrderEvent>),
    );

    return { ok: true, menu_item_id: menuItemId, is_available: menu.is_available };
  }

async markOrderPreparing(ownerId: string, orderId: string, note?: string) {
  return await this.dataSource.transaction(async (manager) => {
  const orderRepo = manager.getRepository(Order);
  const eventRepo = manager.getRepository(OrderEvent);


const order = await orderRepo.findOne({ where: { id: orderId }, relations: ['restaurant', 'items'] });
if (!order) throw new NotFoundException('Order not found');
if (!order.restaurant || order.restaurant.owner_id !== ownerId) throw new BadRequestException('Not authorized');


// Only allow preparing after payment is confirmed
if (order.status !== OrderStatus.PAID) {
throw new BadRequestException('Order cannot be marked preparing until payment is confirmed');
}


order.status = OrderStatus.PREPARING;
await orderRepo.save(order);


await eventRepo.save(eventRepo.create({
order_id: order.id,
actor_id: ownerId,
action: 'OWNER_PREPARING',
meta: note ? { note } : undefined,
} as DeepPartial<OrderEvent>));


// emit after commit
return order;
}).then(async (committedOrder) => {
// Notify clients and other services
this.gateway.emitOrderUpdated(committedOrder);
try {
await this.kafka.emit('order.preparing', { order_id: committedOrder.id, restaurant_id: committedOrder.restaurant_id });
} catch (e) {
this.logger.warn('Kafka emit failed for order.preparing', e as any);
}
return { ok: true };
});
}


async cancelOrder(customerId: string, orderId: string, reason?: string) {
return await this.dataSource.transaction(async (manager) => {
const orderRepo = manager.getRepository(Order);
const eventRepo = manager.getRepository(OrderEvent);

const order = await orderRepo.findOne({ where: { id: orderId }, relations: ['items'] });
if (!order) throw new NotFoundException('Order not found');
if (order.customer_id !== customerId) throw new BadRequestException('Not your order');

// Prevent cancellation after payment succeeded
if (order.payment_status === PaymentStatus.PAID) {
throw new BadRequestException('Cannot cancel an order that has been paid');
}

// Allow cancellation only when order is still in pre-preparing states
const cancellable = [OrderStatus.PENDING, OrderStatus.AWAITING_PAYMENT, OrderStatus.ACCEPTED];
if (!cancellable.includes(order.status)) {
throw new BadRequestException('Order cannot be cancelled at this stage');
}

// Use CANCELLED if enum exists, otherwise fallback to DECLINED
const cancelledStatus = (OrderStatus as any).CANCELLED ?? OrderStatus.DECLINED;
order.status = cancelledStatus;
await orderRepo.save(order);


await eventRepo.save(eventRepo.create({
order_id: order.id,
actor_id: customerId,
action: 'CUSTOMER_CANCELLED',
meta: reason ? { reason } : undefined,
} as DeepPartial<OrderEvent>));

return order;
}).then(async (committedOrder) => {
this.gateway.emitOrderUpdated(committedOrder);
try {
await this.kafka.emit('order.cancelled', { order_id: committedOrder.id, reason });
} catch (e) {
this.logger.warn('Kafka emit failed for order.cancelled', e as any);
}
return { ok: true };
});
}

}
