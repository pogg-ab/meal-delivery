import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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

  /**
   * Issue a pickup code + token for an order (idempotent: reuses existing active code if present).
   * expiryMinutes default 30, codeLength default 6, maxAttempts default 5.
   */
  async issuePickupForOrder(orderId: string, expiryMinutes = 30, codeLength = 6, maxAttempts = 5) {
    const order = await this.orderRepo.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');

    // Require the order to be paid before issuing a pickup code
    // Payment status is stored as a string in the entity (e.g. 'PAID')
    if (String(order.payment_status).toUpperCase() !== 'PAID') {
      throw new BadRequestException('Order is not paid');
    }

    // inside OrdersPickupService.issuePickupForOrder(...)
  const now = Date.now();
  const expiresAtMs = now + expiryMinutes * 60 * 1000;
  const expiresInSeconds = Math.floor((expiresAtMs - now) / 1000);

    // generate code and sign token (payload does NOT include exp)
  const code = generateNumericCode(8);
  const token = signPickupToken({ order_id: orderId, code }, this.tokenSecret, expiresInSeconds);

  const rec = this.pickupRepo.create({
  order_id: orderId,
  pickup_code_hash: code,
  pickup_token: token,
  expires_at: new Date(expiresAtMs),
  verified: false,
     });
  await this.pickupRepo.save(rec);
  return rec;

  }

  /**
   * Verify pickup by code or token. "actorId" is the restaurant owner user id executing the verify.
   * Ensures single use, expiry and attempt counting to prevent brute force.
   */
  async verifyPickup(orderId: string, actorId: string, opts: { code?: string; token?: string }) {
    const rec = await this.pickupRepo.findOne({ where: { order_id: orderId } });
    if (!rec) throw new NotFoundException('Pickup record not found for this order');

    if (rec.verified) throw new BadRequestException('Pickup already verified');

    const now = Date.now();
    if (rec.expires_at && rec.expires_at.getTime() < now) throw new BadRequestException('Pickup code expired');

    // ensure counters exist
    rec.attempts_count = rec.attempts_count ?? 0;
    rec.max_attempts = rec.max_attempts ?? 5;

    if (rec.attempts_count >= rec.max_attempts) {
      throw new BadRequestException('Too many verification attempts');
    }

    // verify either token or code
    let matched = false;
    if (opts.token) {
      try {
        const payload = verifyPickupToken(opts.token, this.tokenSecret);
        if (!payload) throw new BadRequestException('Invalid or expired token');
        if (payload.order_id !== orderId) throw new BadRequestException('Token does not match order');
        // optional: check code match too
        matched = true;
      } catch (e) {
        // invalid token -> increment attempts
        rec.attempts_count++;
        await this.pickupRepo.save(rec);
        throw e;
      }
    } else if (opts.code) {
      if (String(rec.pickup_code_hash) === String(opts.code)) {
        matched = true;
      } else {
        rec.attempts_count++;
        await this.pickupRepo.save(rec);
        if (rec.attempts_count >= rec.max_attempts) {
          throw new BadRequestException('Too many verification attempts');
        }
        throw new BadRequestException('Invalid code');
      }
    } else {
      throw new BadRequestException('code or token required');
    }

    if (!matched) throw new BadRequestException('Verification failed');

    rec.verified = true;
    rec.verified_by = actorId;
    rec.verified_at = new Date();
    await this.pickupRepo.save(rec);

    // Optionally update order status to a final state (PICKED_UP / COMPLETED)
    try {
      const order = await this.orderRepo.findOne({ where: { id: orderId } });
      if (order) {
        // keep behavior configurable; don't force a status change if your workflow differs
        // order.status = OrderStatus.COMPLETED;
        await this.orderRepo.save(order);
      }
    } catch (e) {
      this.logger.warn('Failed updating order status after pickup verification', e?.message ?? e);
    }

    return rec;
  }
}
