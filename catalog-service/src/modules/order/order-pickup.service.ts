
// src/modules/order/order-pickup.service.ts
import { Injectable, Logger, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { OrderPickup } from '../../entities/order-pickup.entity';
import { Order } from '../../entities/order.entity';
import { generateNumericCode, signPickupToken, verifyPickupToken } from '../../utils/pickup.util';

@Injectable()
export class OrdersPickupService {
  private readonly logger = new Logger(OrdersPickupService.name);
  private tokenSecret = process.env.PICKUP_TOKEN_SECRET || process.env.SERVICE_AUTH_SECRET || 'changeme';

  constructor(
    @InjectRepository(OrderPickup) private readonly pickupRepo: Repository<OrderPickup>,
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
  ) {}

  private async findActivePickup(orderId: string): Promise<OrderPickup | null> {
    const now = new Date();
    const rec = await this.pickupRepo.findOne({
      where: {
        order_id: orderId,
        verified: false,
        expires_at: MoreThan(now),
      },
    });
    return rec ?? null;
  }

async getOrIssuePickupForCustomer(
  orderId: string,
  customerUserId: string,
  expiryMinutes = 30,
  codeLength = 6,
  maxAttempts = 5,
) {
  const order = await this.orderRepo.findOne({ where: { id: orderId } });
  if (!order) throw new NotFoundException('Order not found');
  if (order.customer_id !== customerUserId) throw new BadRequestException('Not allowed');

  const rec = await this.issuePickupForOrder(orderId, expiryMinutes, codeLength, maxAttempts);
  this.logger.debug('getOrIssuePickupForCustomer - pickup rec', rec);

  const code = (rec as any).pickup_code_hash;
    

  const token = (rec as any).pickup_token ?? undefined;
  const expires_at = (rec as any).expires_at ?? undefined;

  return {
    pickup_token: token,
    pickup_code: code,
    expires_at,
    raw: rec,
  };
}


async issuePickupForOrder(orderId: string, expiryMinutes = 30, codeLength = 6, maxAttempts = 5) {
  const order = await this.orderRepo.findOne({ where: { id: orderId } });
  if (!order) throw new NotFoundException('Order not found');

  if (String(order.payment_status).toUpperCase() !== 'PAID') {
    throw new BadRequestException('Order is not paid');
  }

  // Reuse existing active (not expired, not verified) pickup if present
  const now = Date.now();
  const active = await this.pickupRepo.findOne({
    where: {
      order_id: orderId,
      verified: false,
    }
  });

  if (active && active.expires_at && active.expires_at.getTime() > now && active.verified === false) {
    return active;
  }

  // create new code + token
  const expiresAtMs = now + expiryMinutes * 60 * 1000;
  const expiresInSeconds = Math.floor((expiresAtMs - now) / 1000);

  const code = generateNumericCode(codeLength);
  const token = signPickupToken({ order_id: orderId, code }, this.tokenSecret, expiresInSeconds);

  // Defensive creation: attempt to insert, but if unique constraint violated (concurrent worker),
  // re-query and return existing.
  const rec = this.pickupRepo.create({
    order_id: orderId,           
    pickup_code_hash: code,     
    pickup_token: token,
    expires_at: new Date(expiresAtMs),
    verified: false,
    attempts_count: 0,
    max_attempts: maxAttempts,
  } as any);

  try {
    const saved = await this.pickupRepo.save(rec);
    return saved;
  } catch (err: any) {
    if (err?.code === '23505') {
      const existing = await this.pickupRepo.findOne({ where: { order_id: orderId } });
      if (existing) return existing;
    }
    // bubble up otherwise
    throw err;
  }
}


// OrdersPickupService (add or replace verify method with this)
async verifyPickupAsOwner(
  orderId: string,
  actorId: string,
  actorRestaurantId: string,
  opts: { code?: string; token?: string },
) {
  const order = await this.orderRepo.findOne({
    where: { id: orderId },
    relations: ['items', 'restaurant'],
  });
  if (!order) {
    throw new NotFoundException('Order not found');
  }

  if (!order.restaurant_id) {
    throw new BadRequestException('Order has no restaurant associated');
  }

  if (String(order.restaurant_id) !== String(actorRestaurantId)) {
    throw new ForbiddenException('You are not allowed to verify pickups for this order');
  }

  const rec = await this.pickupRepo.findOne({ where: { order_id: orderId } });
  if (!rec) throw new NotFoundException('Pickup record not found for this order');

  if (rec.verified) throw new BadRequestException('Pickup already verified');

  const now = Date.now();
  if (rec.expires_at && rec.expires_at.getTime() < now) throw new BadRequestException('Pickup code expired');

  rec.attempts_count = rec.attempts_count ?? 0;
  rec.max_attempts = rec.max_attempts ?? 5;

  if (rec.attempts_count >= rec.max_attempts) {
    throw new BadRequestException('Too many verification attempts');
  }

  // 3) verification logic (token preferred)
  let matched = false;
  if (opts.token) {
    
    const payload = verifyPickupToken(opts.token, this.tokenSecret);
    if (!payload) {
      rec.attempts_count++;
      rec.last_attempt_at = new Date();
      await this.pickupRepo.save(rec);
      throw new BadRequestException('Invalid or expired token');
    }
    if (payload.order_id !== orderId) {
      rec.attempts_count++;
      rec.last_attempt_at = new Date();
      await this.pickupRepo.save(rec);
      throw new BadRequestException('Token does not match order');
    }
    matched = true;
  } else if (opts.code) {
    // compare normalized strings
    const stored = String((rec as any).pickup_code ?? (rec as any).pickup_code_hash ?? '');
    if (stored && stored === String(opts.code)) {
      matched = true;
    } else {
      rec.attempts_count++;
      rec.last_attempt_at = new Date();
      await this.pickupRepo.save(rec);
      if (rec.attempts_count >= rec.max_attempts) {
        throw new BadRequestException('Too many verification attempts');
      }
      throw new BadRequestException('Invalid code');
    }
  } else {
    throw new BadRequestException('code or token required');
  }

  if (!matched) {
    rec.attempts_count++;
    rec.last_attempt_at = new Date();
    await this.pickupRepo.save(rec);
    throw new BadRequestException('Verification failed');
  }

  // 4) mark verified (single-use) and save audit info
  rec.verified = true;
  rec.verified_by = actorId;
  rec.verified_at = new Date();
  rec.last_attempt_at = new Date();
  await this.pickupRepo.save(rec);

  // 5) optionally update order state here (or let OrdersService handle it via event)
  // e.g. await this.orderRepo.save(order);

  // 6) return pickup along with order summary so controller can display it
  // add order relation to returned object
  const result = {
    ...rec,
    order, // full order object (includes items)
  };

   return result;
 }
}
