
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
  async createOrder(customerId: string, dto: CreateOrderDto): Promise<Order> {
    if (!dto.items || dto.items.length === 0) throw new BadRequestException('No items');

    return await this.dataSource.transaction(async (manager) => {
      const orderRepo = manager.getRepository(Order);
      const orderItemRepo = manager.getRepository(OrderItem);
      const menuRepo = manager.getRepository(MenuItem);
      const orderEventRepo = manager.getRepository(OrderEvent);

      let total = 0;

      type Prepared = { menu_id: string; name: string; unit_price: number; qty: number; subtotal: number; instructions?: string };
      const preparedItems: Prepared[] = [];

      // Validate menu items (existence and availability) and compute totals. No inventory touched.
      for (const it of dto.items) {
        const menu = await menuRepo.findOne({ where: { id: it.menu_item_id } });
        if (!menu) throw new NotFoundException(`Menu item not found: ${it.menu_item_id}`);

        if (!menu.is_available) {
          throw new BadRequestException(`Item not available: ${menu.name}`);
        }

        const qty = Number(it.quantity ?? 1);
        const subtotal = Number(menu.price) * qty;
        total += subtotal;

        preparedItems.push({
          menu_id: menu.id,
          name: menu.name,
          unit_price: Number(menu.price),
          qty,
          subtotal,
          instructions: it.instructions ?? undefined,
        });
      }

      // Create order snapshot
      const orderData: DeepPartial<Order> = {
        customer_id: customerId,
        restaurant_id: dto.restaurant_id,
        total_amount: total,
        currency: dto.currency ?? 'USD',
        instructions: dto.instructions ?? undefined,
        is_delivery: !!dto.is_delivery,
        status: OrderStatus.PENDING,
        payment_status: PaymentStatus.NONE,
      };

      const orderEntity = orderRepo.create(orderData);
      const savedOrder = await orderRepo.save(orderEntity);

      // Persist order items (snapshots)
      for (const p of preparedItems) {
        const itemData: DeepPartial<OrderItem> = {
          order_id: savedOrder.id,
          menu_item_id: p.menu_id,
          name: p.name,
          unit_price: p.unit_price,
          quantity: p.qty,
          subtotal: p.subtotal,
          instructions: p.instructions ?? undefined,
        };
        const itemEntity = orderItemRepo.create(itemData as any);
        await orderItemRepo.save(itemEntity);
      }

      // record event (ORDER_CREATED). actor_id exists (customerId) and order_id exists
      await orderEventRepo.save(
        orderEventRepo.create({
          order_id: savedOrder.id,
          actor_id: customerId,
          action: 'ORDER_CREATED',
          meta: { items: dto.items },
        } as DeepPartial<OrderEvent>),
      );

      const fullOrder = await orderRepo.findOne({ where: { id: savedOrder.id }, relations: ['items'] });
      if (!fullOrder) throw new NotFoundException('Order not found after creation');

      // notify via websocket and kafka
      this.gateway.emitOrderCreated(fullOrder);

      try {
        await this.kafka.emit('order.created', fullOrder);
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
    const inventoryPayload = {
      orderId: order.id,
      items: order.items.map(item => ({
        menuItemId: item.menu_item_id,
        quantity: item.quantity,
      })),
    };
    try {
      await this.kafka.emit('order.confirmed', inventoryPayload);
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

  /**
   * Owner API: toggle a menu item's availability.
   * - Ensures the caller owns the restaurant.
   * - Ensures menu item belongs to the restaurant.
   */
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
}
