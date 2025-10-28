
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
import { OrdersPickupService } from './order-pickup.service'; 
import { OrderPickup } from '../../entities/order-pickup.entity';
import { CancelOrderDto } from './dtos/cancel-order.dto';
import { OwnerPreparingDto } from './dtos/owner-preparing.dto';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
    @InjectRepository(OrderEvent) private readonly orderEventRepo: Repository<OrderEvent>,
    @InjectRepository(OrderItem) private readonly orderItemRepo: Repository<OrderItem>,
    @InjectRepository(MenuItem) private readonly menuItemRepo: Repository<MenuItem>,
    @InjectRepository(Restaurant) private readonly restaurantRepo: Repository<Restaurant>,
    private readonly dataSource: DataSource,
    private readonly gateway: OrderGateway,
    private readonly kafka: KafkaProvider,
    private readonly pickupService: OrdersPickupService,
  ) {}

  async createOrder(customerId: string, username: string, phone: string, dto: CreateOrderDto): Promise<Order> {
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

      const restaurant = await restaurantRepo.findOne({ where: { id: dto.restaurant_id } });
      if (!restaurant) {
        throw new NotFoundException(`Restaurant with ID ${dto.restaurant_id} not found.`);
      }
      const ownerId = restaurant.owner_id;

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
        customer_name: username,
        customer_phone: phone,
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
        const eventPayload = {
          ...fullOrder,
          ownerId: ownerId, 
        };
        await this.kafka.emit('order.created', eventPayload);
        this.logger.log(`Emitted order.created event for order ${fullOrder.id} to owner ${ownerId}`);
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

  if (order.status !== OrderStatus.PENDING) {
    throw new BadRequestException('This order has already been processed and cannot be changed.');
  }

  order.status = accepted ? OrderStatus.ACCEPTED : OrderStatus.DECLINED;
  await this.orderRepo.save(order);

  await this.orderRepo.manager.getRepository(OrderEvent).save(
    this.orderRepo.manager.getRepository(OrderEvent).create({
      order_id: order.id,
      customer_name: order.customer_name,
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
      customer_name: order.customer_name,
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



// Called when payment.initiated event is received from PaymentService
async handlePaymentInitiated(payload: any) {
  const orderId = payload?.order_id;
  if (!orderId) {
    this.logger.warn('payment.initiated missing order_id', { payload });
  }

  const order = await this.orderRepo.findOne({ where: { id: orderId } });
  if (!order) {
    this.logger.warn(`Order not found for payment.initiated order=${orderId}`);
    return;
   }

   const incomingTx = payload?.tx_ref ?? null;
   const incomingCheckout = payload?.checkout_url ?? payload?.checkoutUrl ?? null;
   const incomingExpires = payload?.expires_at ? new Date(payload.expires_at) : payload?.expiresAt ? new Date(payload.expiresAt) : null;


   // If an active tx_ref already exists and is not expired, and incoming tx_ref differs,
   // prefer existing active one (idempotency) — otherwise update
    let keepExisting = false;
  if (order.tx_ref && order.payment_expires_at) {
    const now = new Date();
    if (order.payment_expires_at.getTime() > now.getTime()) {
    // existing checkout still active
    if (incomingTx && order.tx_ref === incomingTx) {
   // same transaction -> nothing to change
    keepExisting = true;
    } else {
   // different tx_ref but existing active checkout -> do not overwrite
   this.logger.log(`Existing active checkout present for order ${orderId}. Skipping overwrite.`);
   keepExisting = true;
   }
  }
}

   if (!keepExisting) {
    order.tx_ref = incomingTx ?? order.tx_ref;
    order.checkout_url = incomingCheckout ?? order.checkout_url;
    order.payment_expires_at = incomingExpires ?? order.payment_expires_at;
    // mark as initiated
   try {
    // avoid importing enum here; set string to match enum
      (order as any).payment_status = 'INITIATED';
    } catch (e) {}


   try {
     await this.orderRepo.save(order);
    // persist an order event
    await this.orderEventRepo.save(
    this.orderEventRepo.create({
    order_id: order.id,
    action: 'PAYMENT_INITIATED',
    meta: payload,
    } as Partial<OrderEvent>),
  );
 } catch (e) {
    this.logger.error('Failed to save order update for payment.initiated', e as any);
  }
}


// Optionally: emit websocket update via gateway (if injected) so customer/restaurant UI updates
try {
// this.gateway.emitOrderUpdated(order);
  } catch (e) {
 // ignore
 }
  return order;
}


  async handlePaymentResult(payload: any) {
  this.logger.log(`handlePaymentResult: ${JSON.stringify(payload)}`);
  const order = await this.orderRepo.findOne({
    where: { id: payload.order_id },
    relations: ['items', 'restaurant'],
  });

  if (!order) {
    this.logger.warn(`Order not found for payment result: ${payload.order_id}`);
    return;
  }

  // Normalize detection of success: support multiple shapes
  const payStatus =
    payload?.payment_data?.status ??
    payload?.payment_data?.data?.status ??
    payload?.status ??
    payload?.payment_status ??
    null;

  const isSuccess =
    typeof payStatus === 'string' &&
    ['success', 'paid', 'PAID', 'SUCCESS'].includes(String(payStatus).toLowerCase());

  if (isSuccess) {
    // --- Update order payment fields and status ---
    order.payment_status = PaymentStatus.PAID;
    order.payment_reference =
      payload?.payment_data?.data?.reference ??
      payload?.payment_data?.data?.transaction_reference ??
      payload?.payment_reference ??
      payload?.reference ??
      null;

    order.paid_at =
      payload?.payment_data?.data?.paid_at
        ? new Date(payload.payment_data.data.paid_at)
        : payload?.payment_data?.created_at
        ? new Date(payload.payment_data.created_at)
        : new Date();

    order.status = OrderStatus.PAID;
    await this.orderRepo.save(order);

    // persist PAYMENT_CONFIRMED event
    try {
      await this.orderRepo.manager.getRepository(OrderEvent).save(
        this.orderRepo.manager.getRepository(OrderEvent).create({
          order_id: order.id,
          action: 'PAYMENT_CONFIRMED',
          meta: payload,
        } as Partial<OrderEvent>),
      );
    } catch (e) {
      this.logger.warn('Failed saving PAYMENT_CONFIRMED event', e?.message ?? e);
    }

    // emit order.paid to Kafka
    try {
      await this.kafka.emit('order.paid', { order_id: order.id, paid_at: order.paid_at });
    } catch (e) {
      this.logger.warn('Kafka emit failed for order.paid', e as any);
    }

    // push websocket update
    try {
      this.gateway.emitOrderUpdated(order);
    } catch (e) {
      this.logger.warn('Gateway emitOrderUpdated failed', e as any);
    }

    // --- Issue pickup (idempotent) and notify parties ---
    try {
  // Issue pickup; the service may return a single object or an array
  let pickupRes: OrderPickup | OrderPickup[] | null = await this.pickupService.issuePickupForOrder(order.id, 30);

  // normalize to single OrderPickup
  let pickup: OrderPickup | null = null;
  if (!pickupRes) {
    pickup = null;
  } else if (Array.isArray(pickupRes)) {
    pickup = pickupRes.length > 0 ? (pickupRes[0] as OrderPickup) : null;
  } else {
    pickup = pickupRes as OrderPickup;
  }

  if (!pickup) {
    this.logger.warn('Pickup issuance returned no record', { orderId: order.id, pickupRes });
  } else {
    // Normalize to undefined (not null) to match gateway/Kafka types
    const pickupToken: string | undefined = pickup.pickup_token ?? undefined;
    const pickupCodePrimitive: string | number | undefined =
      pickup.pickup_code_hash === null || pickup.pickup_code_hash === undefined ? undefined : String((pickup.pickup_code_hash as any));
    const expiresAt: Date | string | undefined = pickup.expires_at ?? undefined;

    // Emit gateway events - pass only primitives (undefined if missing)
    try {
      this.gateway.emitPickupCreated(order, {
        pickup_token: pickupToken,
        pickup_code: pickupCodePrimitive,
        expires_at: expiresAt,
      });
    } catch (gwErr) {
      this.logger.warn('Gateway emitPickupCreated failed', gwErr as any);
    }

    // kafka event: include masked code (maskPickupCode accepts string|number|null)
    try {
      const masked = this.maskPickupCode(pickupCodePrimitive ?? null); // mask util accepts null
      await this.kafka.emit('order.pickup_created', {
        order_id: order.id,
        pickup_id: pickup.id,
        pickup_token: pickupToken,            // undefined if missing
        pickup_code_masked: masked,
        expires_at: expiresAt,
      });
    } catch (kErr) {
      this.logger.warn('Failed emitting order.pickup_created', kErr as any);
      }
     }
   } catch (pickupErr) {
    this.logger.warn('Failed to issue pickup after payment', pickupErr?.message ?? pickupErr);
  }
    return;
  }

  // --- Payment failed path ---
  order.payment_status = PaymentStatus.FAILED;
  order.status = OrderStatus.DECLINED;
  await this.orderRepo.save(order);

  try {
    await this.orderRepo.manager.getRepository(OrderEvent).save(
      this.orderRepo.manager.getRepository(OrderEvent).create({
        order_id: order.id,
        action: 'PAYMENT_FAILED',
        meta: payload,
      } as Partial<OrderEvent>),
    );
  } catch (e) {
    this.logger.warn('Failed saving PAYMENT_FAILED event', e?.message ?? e);
  }

  try {
    this.gateway.emitOrderUpdated(order);
  } catch (e) {
    this.logger.warn('Gateway emitOrderUpdated failed', e as any);
  }

  return;
}

// ensure the helper signature accepts string|number|null
private maskPickupCode(code?: string | number | null): string | null {
  if (code === null || code === undefined) return null;
  const s = String(code);
  if (s.length <= 4) return '*'.repeat(Math.max(0, s.length - 1)) + s.slice(-1);
  return s.replace(/\d(?=\d{2})/g, '*'); // show last 2 digits
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
