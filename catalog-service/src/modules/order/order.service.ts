
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
import { MenuPersonalizationService } from '../menu-personalization/menu-personalization.service';
import { OrderPickup } from '../../entities/order-pickup.entity';
import { PromoCodeService } from '../promos/promo.service';
import { CancelOrderDto } from './dtos/cancel-order.dto';
import { OwnerPreparingDto } from './dtos/owner-preparing.dto';
import { ScheduleOrderDto } from './dtos/schedule-order.dto';
import { ScheduledJob } from '../../entities/scheduled-job.entity';
import { ScheduledJobStatus } from '../../entities/scheduled-job.entity';
import { RewardsService } from '../rewards/rewards.service';
import { RewardType } from 'src/entities/enums/reward-type.enum';
import { RewardPointsLedger } from 'src/entities/reward-points-ledger.entity';
const dateFnsTz = require('date-fns-tz');

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
    private readonly promoCodeService: PromoCodeService,
    private readonly menuPersonalizationService: MenuPersonalizationService,
    private readonly rewardsService: RewardsService,
  ) {}




 async rescheduleOrder(
    customerId: string,
    orderId: string,
    newLocalDeliveryTimeStr: string,
  ): Promise<Order> {
    const orderForValidation = await this.orderRepo.findOneBy({ id: orderId });
    if (!orderForValidation) {
      throw new NotFoundException(`Order with ID ${orderId} not found.`);
    }

    const newDeliveryTimeUTC = await this.validateSchedulingTime(
      orderForValidation.restaurant_id,
      newLocalDeliveryTimeStr,
    );

    return await this.dataSource.transaction(async (manager) => {
      const orderRepo = manager.getRepository(Order);
      const jobRepo = manager.getRepository(ScheduledJob);
      const eventRepo = manager.getRepository(OrderEvent);

      const order = await orderRepo.findOne({ where: { id: orderId, customer_id: customerId } });

      if (!order) {
        throw new NotFoundException('Order not found or you do not have permission to access it.');
      }
      // UPDATED CHECK: ensure it's a future scheduled order
      if (order.status !== OrderStatus.SCHEDULED || !order.isScheduled) {
        throw new BadRequestException('Only future scheduled orders can be rescheduled.');
      }

      const job = await jobRepo.findOne({ where: { order: { id: order.id } } });
      if (!job) {
        this.logger.error(`Data integrity issue: Scheduled order ${order.id} is missing its corresponding job.`);
        throw new NotFoundException('Could not find the scheduled job for this order.');
      }
      
      const oldTime = order.scheduledDeliveryTime;

      order.scheduledDeliveryTime = newDeliveryTimeUTC;
      job.runAt = newDeliveryTimeUTC;
      await orderRepo.save(order);
      await jobRepo.save(job);

      await eventRepo.save(
        eventRepo.create({
          order_id: order.id,
          actor_id: customerId,
          action: 'ORDER_RESCHEDULED',
          meta: { oldUtcTime: oldTime?.toISOString() ?? null, requestedLocalTime: newLocalDeliveryTimeStr, newUtcTime: newDeliveryTimeUTC.toISOString() },
        } as DeepPartial<OrderEvent>),
      );

      this.logger.log(`Order ${order.id} rescheduled to ${newDeliveryTimeUTC.toISOString()}`);
      return order;
    });
  }



async unscheduleOrder(customerId: string, orderId: string): Promise<Order> {
    return await this.dataSource.transaction(async (manager) => {
      const orderRepo = manager.getRepository(Order);
      const jobRepo = manager.getRepository(ScheduledJob);
      const eventRepo = manager.getRepository(OrderEvent);

      const order = await orderRepo.findOne({ where: { id: orderId, customer_id: customerId } });

      if (!order) {
        throw new NotFoundException('Order not found or you do not have permission to access it.');
      }
      if (order.status !== OrderStatus.SCHEDULED || !order.isScheduled) {
        throw new BadRequestException('This order is not a future scheduled order.');
      }

      // Core Logic: Convert to an "immediate" order
      order.isScheduled = false;
      order.scheduledDeliveryTime = null;
      const savedOrder = await orderRepo.save(order);

      // CRITICAL: Delete the job from the scheduler queue.
      await jobRepo.delete({ order: { id: order.id } });
      this.logger.log(`Deleted scheduled job for order ${order.id}. Order is now immediate.`);

      await eventRepo.save(
        eventRepo.create({
          order_id: savedOrder.id,
          actor_id: customerId,
          action: 'ORDER_UNSCHEDULED',
        } as DeepPartial<OrderEvent>),
      );

      return savedOrder;
    });
  }



async createOrder(
    customerId: string,
    username: string,
    phone: string,
    dto: CreateOrderDto,
    promoCode?: string | null,
  ): Promise<Order> {
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('Order must contain at least one item.');
    }

    // --- NEW: Scheduling Logic (Validation happens before the transaction) ---
    let deliveryTimeUtc: Date | null = null;
    let isScheduledOrder = false;
    
    if (dto.scheduledDeliveryTime) {
      this.logger.log(`Received scheduled order request for time: ${dto.scheduledDeliveryTime}`);
      deliveryTimeUtc = await this.validateSchedulingTime(
        dto.restaurant_id,
        dto.scheduledDeliveryTime,
      );
      isScheduledOrder = true;
    }
    // --- End of New Scheduling Logic ---

    return await this.dataSource.transaction(async (manager) => {
      // Get repositories from the transaction manager
      const orderRepo = manager.getRepository(Order);
      const orderItemRepo = manager.getRepository(OrderItem);
      const menuRepo = manager.getRepository(MenuItem);
      const orderEventRepo = manager.getRepository(OrderEvent);
      const restaurantRepo = manager.getRepository(Restaurant);
      const ledgerRepo = manager.getRepository(RewardPointsLedger);
      const jobRepo = manager.getRepository(ScheduledJob); // <-- ADDED

      const restaurant = await restaurantRepo.findOne({ where: { id: dto.restaurant_id } });
      if (!restaurant) throw new NotFoundException(`Restaurant with ID ${dto.restaurant_id} not found.`);
      const ownerId = restaurant.owner_id;

      // Compute gross (Original logic - no changes)
      let gross = 0;
      const preparedItems = [] as any[];
      for (const it of dto.items) {
        const menuItem = await menuRepo.findOne({ where: { id: it.menu_item_id } });
        if (!menuItem) throw new NotFoundException(`Menu item not found: ${it.menu_item_id}`);
        if (!menuItem.is_available) throw new BadRequestException(`Item not available: ${menuItem.name}`);

        const qty = Number(it.quantity ?? 1);
        const subtotal = Number(menuItem.price) * qty;
        gross += subtotal;
        preparedItems.push({
          menu_id: menuItem.id,
          name: menuItem.name,
          unit_price: Number(menuItem.price),
          qty,
          subtotal,
          instructions: it.instructions,
        });
      }

      // --- Calculate points discount separately ---
      let discountFromPoints = 0;
      const pointsToRedeem = dto.points_to_redeem;
      if (pointsToRedeem && pointsToRedeem > 0) {
        discountFromPoints = await this.rewardsService.processRedemption(
          customerId,
          pointsToRedeem,
          gross,
          manager,
        );
      }

      // --- Original Promo Logic is UNTOUCHED ---
      const platformFeeRate = Number(process.env.PLATFORM_FEE_RATE ?? 0.05);
      const promoResult = await this.promoCodeService.applyPromo(manager, promoCode, gross, dto.restaurant_id, platformFeeRate);
      
      const finalCustomerPays = promoResult.customer_pays - discountFromPoints;
      const totalDiscountAmount = promoResult.discount_amount + discountFromPoints;

      const discount_breakdown = {
        discount_amount: promoResult.discount_amount,
        restaurant_discount: promoResult.restaurant_discount,
        platform_discount: promoResult.platform_discount,
        platform_topup_needed: promoResult.platform_topup_needed,
        promo: promoResult.promo,
        points_redeemed: pointsToRedeem ?? 0,
        points_discount: discountFromPoints,
      };

      // --- CRITICAL LOGIC CHANGE ---
      // Create order with the final calculated values and new scheduling fields
      const orderData: DeepPartial<Order> = {
        customer_id: customerId,
        customer_name: username,
        customer_phone: phone,
        restaurant_id: dto.restaurant_id,
        total_amount: finalCustomerPays,
        gross_amount: promoResult.gross,
        discount_amount: totalDiscountAmount,
        discount_breakdown,
        promo_code: promoResult.promo?.code ?? null,
        currency: dto.currency ?? 'USD',
        instructions: dto.instructions,
        is_delivery: !!dto.is_delivery,
        status: OrderStatus.SCHEDULED, // <-- CHANGED: All orders start as SCHEDULED
        payment_status: PaymentStatus.NONE,
        // --- ADDED: Set scheduling properties on the order itself ---
        isScheduled: isScheduledOrder,
        scheduledDeliveryTime: deliveryTimeUtc, // This will be null for immediate orders
      };
      const orderEntity = orderRepo.create(orderData);
      const savedOrder = await orderRepo.save(orderEntity);

      // --- ADDED: Create the scheduled job if it's a scheduled order ---
      if (isScheduledOrder && deliveryTimeUtc) {
        const job = jobRepo.create({
          order: savedOrder,
          runAt: deliveryTimeUtc,
          status: ScheduledJobStatus.PENDING,
        });
        await jobRepo.save(job);
        this.logger.log(`Created scheduled job for order ${savedOrder.id} to run at ${deliveryTimeUtc.toISOString()}`);
      }

      // --- Create the ledger entry for the redemption (Original Logic) ---
      if (discountFromPoints > 0 && pointsToRedeem) {
        const ledgerEntry = ledgerRepo.create({
          customer_id: customerId,
          order_id: savedOrder.id,
          points: -Math.abs(pointsToRedeem),
          type: RewardType.REDEEMED,
          description: `Redeemed for order #${savedOrder.id.split('-')[0]}`,
        });
        await ledgerRepo.save(ledgerEntry);
      }

      // Save order items (Original logic - no changes)
      for (const p of preparedItems) {
        const itemEntity = orderItemRepo.create({
          order_id: savedOrder.id,
          menu_item_id: p.menu_id,
          name: p.name,
          unit_price: p.unit_price,
          quantity: p.qty,
          subtotal: p.subtotal,
          instructions: p.instructions,
        } as any);
        await orderItemRepo.save(itemEntity);
      }

      // Save order event with added metadata for scheduling
      await orderEventRepo.save(
        orderEventRepo.create({
          order_id: savedOrder.id,
          actor_id: customerId,
          action: 'ORDER_CREATED',
          meta: {
            items: dto.items,
            promo: promoResult.promo ?? null,
            discount: discount_breakdown,
            gross: promoResult.gross,
            customer_pays: finalCustomerPays,
            isScheduled: isScheduledOrder, // <-- ADDED for audit trail
            scheduledFor: deliveryTimeUtc?.toISOString() ?? null, // <-- ADDED for audit trail
          },
        } as DeepPartial<OrderEvent>),
      );

      // (The rest of the function remains identical to your original)
      const fullOrder = await orderRepo.findOne({ where: { id: savedOrder.id }, relations: ['items', 'restaurant'] });
      if (!fullOrder) throw new NotFoundException('Order not found after creation');

      (this as any).gateway?.emitOrderCreated?.(fullOrder);

      try {
        const eventPayload = {
          order: {
            id: fullOrder.id,
            customer_id: fullOrder.customer_id,
            restaurant_id: fullOrder.restaurant_id,
            items: (fullOrder.items || []).map((i) => ({
              id: i.id,
              menu_item_id: i.menu_item_id,
              name: i.name,
              unit_price: Number(i.unit_price),
              quantity: i.quantity,
              subtotal: Number(i.subtotal),
            })),
            gross_amount: promoResult.gross,
            amount: finalCustomerPays,
            currency: fullOrder.currency,
            promo: promoResult.promo ?? null,
            discount: discount_breakdown,
            platform_fee_amount: promoResult.platform_fee_amount,
            desired_splits: promoResult.desired_splits,
            platform_topup_needed: promoResult.platform_topup_needed,
          },
          ownerId: ownerId,
        };
        await this.kafka.emit('order.created', eventPayload);
        this.logger.log(`Emitted order.created event for order ${fullOrder.id} to owner ${ownerId}`);
      } catch (e) {
        (this as any).logger?.warn?.('Kafka emit failed for order.created', e as any);
      }

      try {
        await this.menuPersonalizationService.trackOrderItemsForPersonalization(fullOrder);
      } catch (e) {
         this.logger?.warn?.('Failed to update personalization for order ' + fullOrder.id, e as any);
        }
      
      return fullOrder;
    });
}
 

  

async ownerResponse(ownerId: string, orderId: string, accepted: boolean, reason?: string): Promise<{ ok: boolean }> {
  return await this.dataSource.transaction(async (manager) => {
    const orderRepo = manager.getRepository(Order);
    const jobRepo = manager.getRepository(ScheduledJob);
    const eventRepo = manager.getRepository(OrderEvent);

    const order = await orderRepo.findOne({ where: { id: orderId }, relations: ['restaurant', 'items'] });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    if (!order.restaurant || order.restaurant.owner_id !== ownerId) {
      throw new BadRequestException('Not authorized to respond to this order');
    }

    // --- CRITICAL VALIDATION CHANGE ---
    // The owner can ONLY act on an order that has been SCHEDULED by the customer.
    if (order.status !== OrderStatus.SCHEDULED) {
      throw new BadRequestException('This order is not currently scheduled and cannot be actioned.');
    }

    // --- NEW LOGIC: DELETE THE SCHEDULED JOB ---
    // Whether the owner accepts or declines, the scheduled job is no longer needed.
    // We must delete it to prevent it from running later.
    await jobRepo.delete({ order: { id: order.id } });
    this.logger.log(`Owner action on order ${order.id}. Associated scheduled job has been deleted.`);

    // --- The rest of the logic proceeds ---
    order.status = accepted ? OrderStatus.ACCEPTED : OrderStatus.DECLINED;
    await orderRepo.save(order);

    await eventRepo.save(
      eventRepo.create({
        order_id: order.id,
        actor_id: ownerId,
        action: accepted ? 'OWNER_ACCEPTED' : 'OWNER_DECLINED',
        meta: reason ? { reason } : undefined,
      } as DeepPartial<OrderEvent>),
    );

    this.gateway.emitOrderUpdated(order);

    if (accepted) {
      // Logic for moving to payment is the same as before
      const confirmedOrderPayload = {
        order_id: order.id,
        customer_id: order.customer_id,
        restaurant_id: order.restaurant_id,
        status: OrderStatus.ACCEPTED,
      };
      await this.kafka.emit('order.confirmed', confirmedOrderPayload);

      const paymentPayload = {
        order_id: order.id,
        amount: Number(order.total_amount),
        currency: order.currency,
        customer_id: order.customer_id,
        restaurant_id: order.restaurant_id,
        customer_name: order.customer_name,
        platform_topup_needed: (order.discount_breakdown as any)
          ?.platform_topup_needed,
      };
      await this.kafka.emit('order.awaiting_payment', paymentPayload);

      order.status = OrderStatus.AWAITING_PAYMENT;
      await orderRepo.save(order);
      this.gateway.emitOrderUpdated(order);
    }
    
    return { ok: true };
  });
}




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
  this.gateway.emitOrderUpdated(order);
} catch (e) {
  this.logger.warn('Gateway emitOrderUpdated failed', e as any);
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
  // CRITICAL FIX: Check data.status first because Chapa verify response has top-level status='success' even for failed txs
  const payStatus =
    payload?.payment_data?.data?.status ??
    payload?.payment_data?.status ??
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

      try {
          if (pickupCodePrimitive) {
            await this.kafka.emit('notification.order.paid_with_pickup', {
              customerId: order.customer_id,
              orderId: order.id,
              pickupCode: pickupCodePrimitive.toString(), // Ensure it's a string
              restaurantName: order.restaurant?.name ?? 'Your Restaurant', // Safely access restaurant name
            });
            this.logger.log(`Emitted notification.order.paid_with_pickup for order ${order.id}`);
          }
        } catch (notificationErr) {
          this.logger.warn('Failed emitting notification.order.paid_with_pickup', notificationErr as any);
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


private maskPickupCode(code?: string | number | null): string | null {
  if (code === null || code === undefined) return null;
  const s = String(code);
  if (s.length <= 4) return '*'.repeat(Math.max(0, s.length - 1)) + s.slice(-1);
  return s.replace(/\d(?=\d{2})/g, '*'); // show last 2 digits
}

  
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

    const order = await orderRepo.findOne({
      where: { id: orderId },
      relations: ['restaurant', 'items'],
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }
    if (!order.restaurant || order.restaurant.owner_id !== ownerId) {
      throw new BadRequestException('Not authorized');
    }

    
    if (order.status !== OrderStatus.PAID) {
      throw new BadRequestException(
        'Order cannot be marked preparing until payment is confirmed',
      );
    }


    order.status = OrderStatus.PREPARING;
    await orderRepo.save(order);

    await eventRepo.save(
      eventRepo.create({
        order_id: order.id,
        actor_id: ownerId,
        action: 'OWNER_PREPARING',
        meta: note ? { note } : undefined,
      } as DeepPartial<OrderEvent>),
    );

    // emit after commit
    return order;
  }).then(async (committedOrder) => {
    // Notify clients and other services
    this.gateway.emitOrderUpdated(committedOrder);
    try {
      // --- USING THE IMPROVED KAFKA EVENT WITH customer_id ---
      await this.kafka.emit('order.preparing', {
        order_id: committedOrder.id,
        restaurant_id: committedOrder.restaurant_id,
        customer_id: committedOrder.customer_id, // This is essential for notifications
      });
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

      const order = await orderRepo.findOne({ where: { id: orderId }, relations: ['items', 'restaurant'] });
      if (!order) throw new NotFoundException('Order not found');
      if (order.customer_id !== customerId) throw new BadRequestException('Not your order');

      // Prevent cancellation after payment succeeded
      if (order.payment_status === PaymentStatus.PAID) {
        throw new BadRequestException('Cannot cancel an order that has been paid');
      }

      // --- START OF CHANGES ---

      // Allow cancellation for scheduled orders in addition to pre-preparing states
      const cancellable = [
        OrderStatus.PENDING,
        OrderStatus.AWAITING_PAYMENT,
        OrderStatus.ACCEPTED,
        OrderStatus.SCHEDULED, // <-- ADDED
      ];
      if (!cancellable.includes(order.status)) {
        throw new BadRequestException('Order cannot be cancelled at this stage');
      }

      // Use CANCELLED if enum exists, otherwise fallback to DECLINED
      const cancelledStatus = (OrderStatus as any).CANCELLED ?? OrderStatus.DECLINED;
      order.status = cancelledStatus;
      await orderRepo.save(order);

      // If the order was a scheduled one, we must also delete its job
      if (order.isScheduled) {
        const jobRepo = manager.getRepository(ScheduledJob);
        // Use the correct relation-based query
        await jobRepo.delete({ order: { id: order.id } });
        this.logger.log(`Deleted scheduled job for cancelled order ${order.id}`);
      }
      
      // --- END OF CHANGES ---

      await eventRepo.save(
        eventRepo.create({
          order_id: order.id,
          actor_id: customerId,
          action: 'CUSTOMER_CANCELLED',
          meta: reason ? { reason } : undefined,
        } as DeepPartial<OrderEvent>),
      );

      return order;
    }).then(async (committedOrder) => {
      this.gateway.emitOrderUpdated(committedOrder);
      try {
        await this.kafka.emit('order.cancelled', { order_id: committedOrder.id, reason, customer_id: committedOrder.customer_id, owner_id: committedOrder.restaurant.owner_id, });
      } catch (e) {
        this.logger.warn('Kafka emit failed for order.cancelled', e as any);
      }
      return { ok: true };
    });
  }


private async validateSchedulingTime(restaurantId: string, localDeliveryTimeStr: string): Promise<Date> {
    // First, fetch the restaurant so we can use its settings.
    const restaurant = await this.restaurantRepo.findOneBy({ id: restaurantId });
    if (!restaurant) {
        throw new NotFoundException('Restaurant not found.');
    }

    const restaurantTimeZone = 'Africa/Addis_Ababa';
    const deliveryTimeUtc = dateFnsTz.fromZonedTime(localDeliveryTimeStr, restaurantTimeZone);

    this.logger.log(`Validating schedule for restaurant ${restaurantId}. Local time: ${localDeliveryTimeStr}, converted to UTC: ${deliveryTimeUtc.toISOString()}`);

    // --- LOGIC CHANGE IS HERE ---
    // Instead of a hardcoded 45, we use the value from the restaurant entity.
    const minLeadTimeMinutes = restaurant.minimumSchedulingLeadTimeMinutes;
    // ----------------------------

    const now = new Date();
    const earliestAllowedTime = new Date(now.getTime() + minLeadTimeMinutes * 60000);
    if (deliveryTimeUtc < earliestAllowedTime) {
        throw new BadRequestException(`Order must be scheduled at least ${minLeadTimeMinutes} minutes in advance.`);
    }

    const maxScheduleDays = 7;
    const latestAllowedTime = new Date(now.getTime() + maxScheduleDays * 24 * 60 * 60 * 1000);
    if (deliveryTimeUtc > latestAllowedTime) {
        throw new BadRequestException(`Orders cannot be scheduled more than ${maxScheduleDays} days in the future.`);
    }
    
    // The rest of the operating hours validation remains the same.
    const deliveryDayIndex = Number(dateFnsTz.formatInTimeZone(deliveryTimeUtc, restaurantTimeZone, 'i')) % 7;
    const deliveryTimeLocal = dateFnsTz.formatInTimeZone(deliveryTimeUtc, restaurantTimeZone, 'HH:mm:ss');

    this.logger.log(`In restaurant's timezone (${restaurantTimeZone}), this is day index ${deliveryDayIndex} at time ${deliveryTimeLocal}`);

    const dayMap = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayName = dayMap[deliveryDayIndex];

    const openTime = restaurant[`${dayName}_open`];
    const closeTime = restaurant[`${dayName}_close`];

    if (!openTime || !closeTime) {
        throw new BadRequestException(`The restaurant is closed on the selected day.`);
    }

    if (deliveryTimeLocal < openTime || deliveryTimeLocal > closeTime) {
        throw new BadRequestException(
            `The restaurant is only open between ${openTime} and ${closeTime} on the selected day.`
        );
    }

    this.logger.log(`Scheduling time validated successfully for restaurant ${restaurantId} with a lead time of ${minLeadTimeMinutes} minutes.`);

    return deliveryTimeUtc;
}

async getScheduledOrdersForRestaurant(ownerId: string, restaurantId: string, limit = 50, offset = 0): Promise<Order[]> {
    // First, a quick security check to ensure the owner ID from the token
    // actually owns the restaurant they are trying to query.
    const restaurant = await this.restaurantRepo.findOneBy({ id: restaurantId, owner_id: ownerId });
    if (!restaurant) {
      throw new NotFoundException('Restaurant not found or you are not the owner.');
    }

    const take = Math.max(1, Math.min(limit, 100));
    const skip = Math.max(0, offset);

    // This is the core query for this feature
    const scheduledOrders = await this.orderRepo.find({
      where: {
        restaurant_id: restaurantId,
        status: OrderStatus.SCHEDULED, // <-- THE KEY FILTER: Only get scheduled orders
      },
      relations: ['items', 'restaurant'], // Load relations needed for the DTO mapping
      order: {
        scheduledDeliveryTime: 'ASC', // <-- IMPORTANT: Show the soonest orders first
      },
      take,
      skip,
    });

    return scheduledOrders;
  }

  async markAsReady(ownerId: string, orderId: string): Promise<{ ok: boolean }> {
    return await this.dataSource.transaction(async (manager) => {
      const orderRepo = manager.getRepository(Order);
      const eventRepo = manager.getRepository(OrderEvent);

      const order = await orderRepo.findOne({ where: { id: orderId }, relations: ['restaurant'] });
      if (!order) {
        throw new NotFoundException('Order not found');
      }
      if (!order.restaurant || order.restaurant.owner_id !== ownerId) {
        throw new BadRequestException('Not authorized to update this order');
      }

      // State machine validation: Must be in PREPARING state
      if (order.status !== OrderStatus.PREPARING) {
        throw new BadRequestException(`Order cannot be marked as ready. Current status: ${order.status}`);
      }

      order.status = OrderStatus.READY; // <-- ADJUSTED TO YOUR ENUM
      await orderRepo.save(order);

      await eventRepo.save(
        eventRepo.create({
          order_id: order.id,
          actor_id: ownerId,
          action: 'OWNER_MARKED_READY',
        } as DeepPartial<OrderEvent>),
      );

      return order;
    }).then(async (committedOrder) => {
      this.gateway.emitOrderUpdated(committedOrder);
      try {
        await this.kafka.emit('order.ready', { // <-- ADJUSTED EVENT NAME
          order_id: committedOrder.id,
          restaurant_id: committedOrder.restaurant_id,
          customer_id: committedOrder.customer_id,
        });
      } catch (e) {
        this.logger.warn('Kafka emit failed for order.ready', e as any);
      }
      return { ok: true };
    });
  }




async markAsComplete(ownerId: string, orderId: string): Promise<{ ok: boolean }> {
    const { committedOrder, pointsAwarded } = await this.dataSource.transaction(async (manager) => {
      const orderRepo = manager.getRepository(Order);
      const eventRepo = manager.getRepository(OrderEvent);

      // ▼▼▼ CHANGE #1: ADD 'items' TO THE RELATIONS HERE ▼▼▼
      const order = await orderRepo.findOne({ 
        where: { id: orderId }, 
        relations: ['restaurant', 'items'] 
      });
      // ▲▲▲ END OF CHANGE #1 ▲▲▲

      if (!order) {
        throw new NotFoundException('Order not found');
      }
      if (!order.restaurant || order.restaurant.owner_id !== ownerId) {
        throw new BadRequestException('Not authorized to update this order');
      }
      if (order.status !== OrderStatus.READY) {
        throw new BadRequestException(`Order cannot be marked as complete. Current status: ${order.status}`);
      }

      order.status = OrderStatus.COMPLETED;
      const savedOrder = await orderRepo.save(order);

      await eventRepo.save(
        eventRepo.create({
          order_id: savedOrder.id,
          actor_id: ownerId,
          action: 'ORDER_COMPLETED',
        } as DeepPartial<OrderEvent>),
      );

      const points = await this.rewardsService.addPointsForCompletedOrder(savedOrder, manager);

      return { committedOrder: savedOrder, pointsAwarded: points };
    });

    // --- AFTER TRANSACTION ---
    
    this.logger.log(`Transaction complete. Value of pointsAwarded is: ${pointsAwarded}`);

    // 1. WebSocket update (Unchanged)
    this.gateway.emitOrderUpdated(committedOrder);

    // 2. 'order.completed' event
    try {
      // ▼▼▼ CHANGE #2: ADD THE 'items' ARRAY TO THE PAYLOAD ▼▼▼
      await this.kafka.emit('order.completed', {
        order_id: committedOrder.id,
        restaurant_id: committedOrder.restaurant_id,
        customer_id: committedOrder.customer_id,
        total_amount: committedOrder.total_amount,
        completed_at: new Date().toISOString(),
        // This is the crucial addition for the inventory service
        items: committedOrder.items.map(item => ({
          menuItemId: item.menu_item_id,
          quantity: item.quantity,
        })),
      });
      // ▲▲▲ END OF CHANGE #2 ▲▲▲
    } catch (e) {
      this.logger.warn('Kafka emit failed for order.completed', e as any);
    }
    
    // 3. Reward notification event (Unchanged)
    try {
      if (pointsAwarded > 0) {
        this.logger.log(`Condition met (pointsAwarded > 0). Emitting reward.points.earned event...`);
        await this.kafka.emit('reward.points.earned', {
          customerId: committedOrder.customer_id,
          pointsAwarded: pointsAwarded,
          orderId: committedOrder.id,
        });
        this.logger.log(`Emitted reward.points.earned event for customer ${committedOrder.customer_id}`);
      } else {
        this.logger.log(`Skipping reward.points.earned event because pointsAwarded is ${pointsAwarded}.`);
      }
    } catch (e) {
      this.logger.warn('Kafka emit failed for reward.points.earned', e as any);
    }
    
    return { ok: true };
  }



}
