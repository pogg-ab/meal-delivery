import { Injectable, Logger, Inject, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Payment } from '../../entities/payment.entity';
import { PlatformAccount } from '../../entities/platform-account.entity';
import { RestaurantSubaccount } from '../../entities/restaurant-subaccount.entity';
import { ChapaService } from './chapa.service';
import { ClientKafka } from '@nestjs/microservices';
import { KafkaProvider } from 'src/providers/kafka.provider';
import { CreateSubaccountDto } from './dtos/create-subaccount.dto';
import { buildChapaFormPayload, ChapaSubaccount } from 'src/utils/chapa-form.utils';
import { PayoutItem } from 'src/entities/payout-item.entity';
import { PayoutBatch } from 'src/entities/payout-batch.entity';
import * as crypto from 'crypto';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  
  constructor(
    @InjectRepository(Payment) private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(PayoutItem) private readonly payoutItemRepo: Repository<PayoutItem>,
    // @InjectRepository(PayoutBatch) private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(RestaurantSubaccount) private readonly subRepo: Repository<RestaurantSubaccount>,
    @InjectRepository(PlatformAccount) private readonly platformRepo: Repository<PlatformAccount>, 
    private readonly dataSource: DataSource,
    private readonly chapa: ChapaService,
    private readonly kafka: KafkaProvider,
  ) {}

private async getPlatformChapaId(): Promise<string | null> {
  try {
    const rec = await this.platformRepo.findOne({ where: {} }); // there will be 0..1 rows
    if (rec && rec.chapa_subaccount_id) return rec.chapa_subaccount_id;
  } catch (e) {
    this.logger.debug('Failed to read platform account from DB', e as any);
  }
  return process.env.PLATFORM_SUBACCOUNT_ID ?? null;
}


async getPlatformAccount() {
  return await this.platformRepo.findOne({ where: {} });
}


private makeTxRef(order_id: string, maxLen = 50) {
  const prefix = 'order-';
  const ts = Date.now().toString(36); 
  const idPart = order_id.replace(/-/g, '').slice(0, 8);
  const reserved = prefix.length + 1 + ts.length; 
  const allowedForId = Math.max(4, maxLen - reserved);
  const shortId = idPart.slice(0, allowedForId);
  return `${prefix}${shortId}-${ts}`;
}

public async handleOrderAwaitingPayment(payload: any): Promise<Payment | null> {
  const correlation = payload?.order_id ?? 'unknown-order';
  this.logger.log(`handleOrderAwaitingPayment start order_id=${correlation}`);

  const {
    order_id,
    amount,
    currency = 'ETB',
    customer_id,
    restaurant_id,
    customer_name,
    desired_splits: payloadDesiredSplits,
    platform_topup_needed: payloadPlatformTopup,
  } = payload ?? {};

  // Basic validation
  if (!order_id || !amount || !customer_id || !restaurant_id) {
    this.logger.warn('Invalid order.awaiting_payment payload', { payload });
    try {
      await this.kafka.emit('payment.failed', { order_id: order_id ?? null, reason: 'invalid_payload' });
    } catch (e) {
      this.logger.warn('Failed emitting payment.failed for invalid payload', (e as any)?.message ?? e);
    }
    return null;
  }

  // Idempotency: existing payment
  const existing = await this.paymentRepo.findOne({ where: { order_id } });
  if (existing) {
    this.logger.log(`Existing payment record found for order ${order_id} status=${existing.status}`);
    try {
      if (existing.status === 'initiated') {
        const checkout_url =
          existing.payment_data?.initResp?.data?.checkout_url ??
          existing.payment_data?.initResp?.checkout_url ??
          existing.payment_data?.checkout_url ??
          existing.payment_data?.initResp?.data?.checkoutUrl ??
          null;
        const expires_at = existing.payment_data?.expires_at ?? null;
        await this.kafka.emit('payment.initiated', { order_id, tx_ref: existing.tx_ref, checkout_url, expires_at });
      } else if (existing.status === 'paid') {
        await this.kafka.emit('payment.success', {
          order_id,
          tx_ref: existing.tx_ref,
          chapa_tx_id: existing.chapa_tx_id,
          amount: existing.amount,
          payment_data: existing.payment_data,
        });
      } else {
        await this.kafka.emit('payment.failed', { order_id, tx_ref: existing.tx_ref, reason: 'previous_attempt_failed' });
      }
    } catch (e) {
      this.logger.warn('Failed emitting event for existing payment', (e as any)?.message ?? e);
    }
    return existing;
  }

  // Ensure restaurant subaccount exists
  const restSub = await this.subRepo.findOne({ where: { restaurant_id } });
  if (!restSub) {
    this.logger.warn(`No restaurant subaccount for restaurant_id=${restaurant_id}`);
    try {
      await this.kafka.emit('payment.failed', { order_id, reason: 'missing_subaccount' });
    } catch (e) {
      this.logger.warn('Failed emitting payment.failed for missing_subaccount', (e as any)?.message ?? e);
    }
    return null;
  }

  // Ensure platform chapa subaccount exists
  const platformChapaId = await this.getPlatformChapaId();
  if (!platformChapaId) {
    this.logger.warn(`Platform subaccount not configured (order=${order_id})`);
    try {
      await this.kafka.emit('payment.failed', { order_id, reason: 'missing_platform_subaccount' });
    } catch (e) {
      this.logger.warn('Failed emitting payment.failed for missing_platform_subaccount', (e as any)?.message ?? e);
    }
    return null;
  }

  // Generate tx_ref
  const tx_ref = this.makeTxRef(order_id);
  this.logger.log(`Generated tx_ref=${tx_ref} for order=${order_id}`);

  // Determine desired_splits / platform_topup_needed
  let desired_splits: any = payloadDesiredSplits ?? payload.order?.desired_splits ?? payload.meta?.desired_splits ?? null;
  let platform_topup_needed: number | null = payloadPlatformTopup ?? null;

  // Default splits from env
  let restSplitValue = 1 - Number(process.env.PLATFORM_FEE_RATE ?? 0.05);
  let platformSplitValue = Number(process.env.PLATFORM_FEE_RATE ?? 0.05);

  if (desired_splits && typeof desired_splits.restaurant_split === 'number' && typeof desired_splits.platform_split === 'number') {
    restSplitValue = Number(desired_splits.restaurant_split);
    platformSplitValue = Number(desired_splits.platform_split);

    // convert percentage to fraction if necessary
    if (restSplitValue > 1 || platformSplitValue > 1) {
      restSplitValue = restSplitValue / 100;
      platformSplitValue = platformSplitValue / 100;
    }

    // guard sum
    const sum = restSplitValue + platformSplitValue;
    if (sum <= 0) {
      restSplitValue = 1 - Number(process.env.PLATFORM_FEE_RATE ?? 0.05);
      platformSplitValue = Number(process.env.PLATFORM_FEE_RATE ?? 0.05);
    } else if (Math.abs(sum - 1) > 0.0001) {
      restSplitValue = restSplitValue / sum;
      platformSplitValue = platformSplitValue / sum;
    }
  }

  // Build subaccounts for Chapa
  const subaccounts: Array<{ id: string; split_type: 'percentage' | 'flat'; split_value: number }> = [
    { id: restSub.chapa_subaccount_id, split_type: 'percentage', split_value: restSplitValue },
    { id: platformChapaId, split_type: 'percentage', split_value: platformSplitValue },
  ];

  // Build meta: include order_id, restaurant_id and platform_topup_needed (so webhook can read directly)
  const meta: any = { order_id, restaurant_id };
  if (platform_topup_needed !== null && typeof platform_topup_needed !== 'undefined') meta.platform_topup_needed = platform_topup_needed;

  const formPayload = buildChapaFormPayload({
    amount,
    currency,
    tx_ref,
    callback_url: '',
    first_name: customer_name,
    customization: { title: 'Order payment', description: `Order ${order_id}` },
    meta,
    subaccounts,
  });

  // Initialize with Chapa
  let initResp: any;
  try {
    this.logger.log(`Initializing Chapa transaction tx_ref=${tx_ref} order_id=${order_id}`);
    initResp = await this.chapa.initializeTransaction(formPayload);
    this.logger.debug('Chapa init response (keys)', { keys: initResp && typeof initResp === 'object' ? Object.keys(initResp).slice(0, 6) : null });
  } catch (err: any) {
    const chapaErr = err?.response?.data ?? err?.message ?? err;
    this.logger.error(`Chapa initialization failed for order=${order_id}`, chapaErr);
    try {
      await this.kafka.emit('payment.failed', { order_id, tx_ref, reason: 'chapa_init_error', error: chapaErr });
    } catch (e) {
      this.logger.warn('Failed emitting payment.failed after chapa init failure', (e as any)?.message ?? e);
    }
    return null;
  }

  // Extract checkout_url / expires_at / chapa_tx_id
  const checkout_url =
    initResp?.data?.checkout_url ??
    initResp?.checkout_url ??
    initResp?.data?.checkoutUrl ??
    initResp?.checkoutUrl ??
    initResp?.data?.data?.checkout_url ??
    null;
  const expires_at = initResp?.data?.expires_at ?? initResp?.expires_at ?? null;
  const chapa_tx_id = initResp?.data?.id ?? initResp?.id ?? null;

  // Persist Payment entity (include platform_topup_needed in payment_data for reference)
  const paymentEntity = this.paymentRepo.create({
    order_id,
    tx_ref,
    chapa_tx_id: chapa_tx_id ?? undefined,
    amount,
    currency,
    status: 'initiated',
    payment_data: {
      initResp,
      expires_at: expires_at ? new Date(expires_at).toISOString() : new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      platform_topup_needed: meta.platform_topup_needed ?? null,
      restaurant_id,
    },
  } as any) as unknown as Payment;

  let savedPayment: Payment;
  try {
    savedPayment = await this.paymentRepo.save(paymentEntity);
  } catch (dbErr: any) {
    this.logger.error(`Failed saving payment for order ${order_id}`, dbErr?.message ?? dbErr);

    // concurrent save might have created a record — re-fetch single entity
    const maybeExisting = await this.paymentRepo.findOne({ where: { order_id } });
    if (maybeExisting) {
      const cku =
        maybeExisting.payment_data?.initResp?.data?.checkout_url ??
        maybeExisting.payment_data?.initResp?.checkout_url ??
        maybeExisting.payment_data?.checkout_url ??
        null;
      try {
        await this.kafka.emit('payment.initiated', { order_id, tx_ref: maybeExisting.tx_ref, checkout_url: cku, expires_at: maybeExisting.payment_data?.expires_at ?? null });
      } catch (e) {
        this.logger.warn('Failed emitting payment.initiated after concurrent DB save', (e as any)?.message ?? e);
      }
      return maybeExisting;
    }

    try {
      await this.kafka.emit('payment.failed', { order_id, tx_ref, reason: 'db_save_failed' });
    } catch (e) {
      this.logger.warn('Failed emitting payment.failed after db_save_failed', (e as any)?.message ?? e);
    }
    return null;
  }

  // Emit payment.initiated
  try {
    await this.kafka.emit('payment.initiated', {
      order_id,
      tx_ref,
      checkout_url,
      expires_at: savedPayment.payment_data?.expires_at ?? null,
    });
    console.log(checkout_url);
    this.logger.log(`payment.initiated emitted for order ${order_id} tx_ref=${tx_ref}`);
  } catch (emitErr: any) {
    this.logger.warn('Failed to emit payment.initiated to kafka', emitErr?.message ?? emitErr);
  }

  return savedPayment;
}

// Paste into PaymentsService
async handleChapaWebhook(rawBody: Buffer | undefined, signatureHeader?: string): Promise<void> {
  const logger = this.logger ?? new (require('@nestjs/common').Logger)('PaymentsService');
  const { BadRequestException } = require('@nestjs/common');
  const crypto = require('crypto');

  const secret = process.env.CHAPA_WEBHOOK_SECRET;
  if (!secret) {
    logger.error('CHAPA_WEBHOOK_SECRET not configured');
    throw new Error('Server misconfiguration');
  }

  // Validate raw body & signature header presence
  if (!rawBody || !(rawBody instanceof Buffer)) {
    logger.warn('Missing rawBody in webhook request');
    throw new BadRequestException('raw body required');
  }
  if (!signatureHeader) {
    logger.warn('Missing signature header');
    throw new BadRequestException('signature header required');
  }

  // Normalize signature header (support "sha256=..." prefix)
  let sigToken = signatureHeader.trim();
  if (/^sha256=/i.test(sigToken)) sigToken = sigToken.split('=')[1];

  // Compute HMAC and verify
  const computed = crypto.createHmac('sha256', secret).update(rawBody).digest();
  let sigBuf: Buffer | null = null;
  if (/^[0-9a-f]{64}$/i.test(sigToken)) {
    sigBuf = Buffer.from(sigToken, 'hex');
  } else {
    try {
      sigBuf = Buffer.from(sigToken, 'base64');
    } catch {
      sigBuf = null;
    }
  }
  if (!sigBuf) {
    logger.warn('Unable to parse signature header (not hex or base64)');
    throw new BadRequestException('invalid signature format');
  }
  if (sigBuf.length !== computed.length) {
    logger.warn('Signature length mismatch', { expected: computed.length, got: sigBuf.length });
    throw new BadRequestException('invalid signature');
  }
  if (!crypto.timingSafeEqual(computed, sigBuf)) {
    logger.warn('Invalid webhook signature (timingSafeEqual failed)');
    throw new BadRequestException('Invalid webhook signature');
  }

  // Parse payload
  let payload: any;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch (e) {
    logger.error('Failed to parse webhook JSON', e?.message ?? e);
    throw new BadRequestException('invalid json');
  }

  logger.log('Valid webhook received');
  logger.debug('webhook payload:', payload);

  // Accept multiple shapes for tx_ref
  const tx_ref = payload?.tx_ref ?? payload?.data?.tx_ref ?? payload?.data?.reference ?? null;
  if (!tx_ref) {
    logger.warn('tx_ref missing in webhook payload', payload);
    throw new BadRequestException('tx_ref missing');
  }

  // Find saved payment by tx_ref
  const payment = await this.paymentRepo.findOne({ where: { tx_ref } });
  if (!payment) {
    logger.warn(`No payment found for tx_ref ${tx_ref}`);
    // ack webhook but do nothing else
    return;
  }

  // Idempotent: ignore already-paid
  if (payment.status === 'paid') {
    logger.log(`Webhook for already-paid payment ${tx_ref} ignored`);
    return;
  }

  // Verify transaction with Chapa
  let verifyResp: any;
  try {
    verifyResp = await this.chapa.verifyTransaction(tx_ref);
  } catch (err: any) {
    logger.error('Chapa verify failed', err?.response?.data ?? err?.message ?? err);
    // don't change DB state on verify failure; allow retries
    return;
  }

  logger.debug('Chapa verify response', verifyResp);

  // Normalize status
  const statusRaw = verifyResp?.data?.status ?? verifyResp?.status ?? null;
  const status = typeof statusRaw === 'string' ? statusRaw.toLowerCase() : null;

  if (status === 'success' || status === 'paid' || status === 'ok') {
    // Mark payment paid
    payment.status = 'paid';
    payment.chapa_tx_id = verifyResp?.data?.id ?? payment.chapa_tx_id;
    payment.payment_data = verifyResp;
    payment.paid_at = new Date();
    await this.paymentRepo.save(payment);

    // Emit payment.success event
    try {
      await this.kafka.emit('payment.success', {
        order_id: payment.order_id,
        tx_ref: payment.tx_ref,
        chapa_tx_id: payment.chapa_tx_id,
        amount: payment.amount,
        payment_data: verifyResp,
      });
    } catch (e) {
      logger.warn('Failed to emit payment.success', e?.message ?? e);
    }

    // ----------------------------
    // Determine platformTopupNeeded and restaurantId — NO Catalog fetch
    // Priority:
    // 1) verifyResp.data.meta (Chapa verify payload)
    // 2) verifyResp.meta
    // 3) payment.payment_data.initResp.meta (what we saved when initiating)
    // 4) payment.payment_data.platform_topup_needed / payment.payment_data.restaurant_id
    // ----------------------------
    const metaFromVerify =
      verifyResp?.data?.meta ??
      verifyResp?.meta ??
      verifyResp?.data?.data?.meta ??
      null;

    let platformTopupNeeded: any = metaFromVerify?.platform_topup_needed ?? null;
    let restaurantIdFromMeta: string | null = metaFromVerify?.restaurant_id ?? null;

    if (!platformTopupNeeded) {
      platformTopupNeeded =
        payment.payment_data?.initResp?.meta?.platform_topup_needed ??
        payment.payment_data?.platform_topup_needed ??
        null;
    }
    if (!restaurantIdFromMeta) {
      restaurantIdFromMeta =
        payment.payment_data?.initResp?.meta?.restaurant_id ??
        payment.payment_data?.restaurant_id ??
        null;
    }

    // Normalize platformTopupNeeded
    if (typeof platformTopupNeeded === 'string') {
      const parsed = Number(platformTopupNeeded);
      platformTopupNeeded = Number.isFinite(parsed) ? parsed : null;
    }
    if (platformTopupNeeded !== null) platformTopupNeeded = Number(platformTopupNeeded);

    const restaurantId = restaurantIdFromMeta ?? null;

    // If there's a platform top-up > 0, create payout item with bank details (if available)
    if (platformTopupNeeded && Number(platformTopupNeeded) > 0) {
      // Idempotency check
      const existingPayout = await this.payoutItemRepo.findOne({
        where: { order_id: payment.order_id, reason: 'promo_platform_topup' },
      });

      if (!existingPayout) {
        if (!restaurantId) {
          logger.warn(
            `Platform topup needed (${platformTopupNeeded}) for order ${payment.order_id} but restaurant_id is missing in webhook/meta/payment_data — skipping payout item creation.`,
          );
        } else {
          // Fetch restaurant subaccount to copy bank details (if exists)
          let subRec: any = null;
          try {
            if (!this.subRepo) {
              logger.warn('Restaurant subRepo not available on PaymentsService; cannot fetch bank details.');
            } else {
              subRec = await this.subRepo.findOne({ where: { restaurant_id: restaurantId } });
            }
          } catch (e) {
            logger.warn('Failed fetching restaurant subaccount for bank details', (e as any)?.message ?? e);
            subRec = null;
          }

          // Build payout item payload, copying bank details if present
          const piPayload: any = {
            order_id: payment.order_id,
            payment_id: payment.id,
            restaurant_id: restaurantId,
            amount: Number(platformTopupNeeded),
            status: 'pending',
            reason: 'promo_platform_topup',
            meta: { tx_ref: payment.tx_ref, created_via: 'chapa_webhook' },
          };

          if (subRec) {
            piPayload.account_number = subRec.account_number ?? null;
            piPayload.account_name = subRec.account_name ?? null;
            piPayload.bank_code = subRec.bank_code ?? null;
          } else {
            // keep them null if subaccount not found — admin should populate later
            piPayload.account_number = null;
            piPayload.account_name = null;
            piPayload.bank_code = null;
          }

          // Persist payout item (normalize save result)
          const piEntity = this.payoutItemRepo.create(piPayload as any);
          const savedResult = await this.payoutItemRepo.save(piEntity);
          const savedPi = Array.isArray(savedResult) ? savedResult[0] : savedResult;

          logger.log(`Created payout_item ${savedPi.id} for order ${payment.order_id} amount=${savedPi.amount} (bank: ${savedPi.account_number ?? 'none'})`);
        }
      } else {
        logger.log(`PayoutItem already exists for order ${payment.order_id}, skipping creation`);
      }
    } else {
      logger.debug(`No platform_topup_needed for order ${payment.order_id} (value: ${platformTopupNeeded})`);
    }

    return;
  }

  // non-success: mark payment failed and emit event
  payment.status = 'failed';
  payment.payment_data = verifyResp;
  await this.paymentRepo.save(payment);

  try {
    await this.kafka.emit('payment.failed', {
      order_id: payment.order_id,
      tx_ref: payment.tx_ref,
      reason: 'chapa_status_not_success',
      payment_data: verifyResp,
    });
  } catch (e) {
    logger.warn('Failed to emit payment.failed', e?.message ?? e);
  }

  return;
}

  // --- create/update platform account (internal) ---
  async createOrUpdatePlatformAccount(dto: CreateSubaccountDto) {
    // call Chapa
    const resp = await this.chapa.createSubaccount(dto);
    const chapa_subaccount_id = resp?.data?.subaccount_id;
    if (!chapa_subaccount_id) throw new Error('Chapa returned unexpected response while creating platform subaccount');
  
    // If platform record exists, update; else create
    const existing = await this.platformRepo.findOne({ where: {} });
    if (existing) {
      existing.chapa_subaccount_id = chapa_subaccount_id;
      existing.raw = resp;
      return this.platformRepo.save(existing);
    } else {
      const rec = this.platformRepo.create({ chapa_subaccount_id, raw: resp });
      return this.platformRepo.save(rec);
    }
  }

  //Create subaccounts for restaurants to collect order payment
async createSubaccountInternal(restaurant_id: string, payload: CreateSubaccountDto) {
  const logger = this.logger ?? new (require('@nestjs/common').Logger)('PaymentsService');
  const {
    business_name,
    account_name,
    bank_code,
    account_number,
    split_value,
    split_type,
    return_url,
  } = payload;

  // Basic validation of bank details (you can make this stricter if needed)
  if (!account_name || !account_number || !bank_code) {
    throw new Error('account_name, account_number and bank_code are required to onboard a restaurant subaccount');
  }

  const chapaPayload = {
    business_name,
    account_name,
    bank_code: Number(bank_code),
    account_number: String(account_number),
    split_value: Number(split_value ?? 0),
    split_type,
    return_url: return_url ?? process.env.CHAPA_RETURN_URL ?? undefined,
  } as any;

  // Call Chapa to create subaccount
  let resp: any;
  try {
    resp = await this.chapa.createSubaccount(chapaPayload);
    logger.log(`Chapa subaccount created for restaurant=${restaurant_id}`);
    logger.debug('chapa resp keys', { keys: resp && typeof resp === 'object' ? Object.keys(resp).slice(0, 8) : null });
  } catch (err: any) {
    logger.error('Chapa createSubaccount failed', err?.response?.data ?? err?.message ?? err);
    throw new Error('Chapa subaccount creation failed');
  }

  const chapa_subaccount_id = resp?.data?.subaccount_id ?? resp?.id ?? null;
  if (!chapa_subaccount_id) {
    logger.error('Chapa returned unexpected response while creating subaccount', resp);
    throw new Error('Chapa subaccount creation failed (no id returned)');
  }

  // Upsert local DB record for restaurant subaccount, including bank details
  try {
    const existing = await this.subRepo.findOne({ where: { restaurant_id } });
    if (existing) {
      existing.chapa_subaccount_id = chapa_subaccount_id;
      existing.account_name = account_name ?? existing.account_name;
      existing.account_number = String(account_number ?? existing.account_number);
      existing.bank_code = String(bank_code ?? existing.bank_code);
      existing.raw = resp;
      const updated = await this.subRepo.save(existing);
      logger.log(`Updated restaurant_subaccounts for restaurant ${restaurant_id} (id=${updated.id})`);
      return updated;
    } else {
      const rec = this.subRepo.create({
        restaurant_id,
        chapa_subaccount_id,
        account_name,
        account_number: String(account_number),
        bank_code,
        raw: resp,
      } as any);
      const saved = await this.subRepo.save(rec);
      logger.log(`Created restaurant_subaccounts for restaurant ${restaurant_id}`);
      return saved;
    }
  } catch (dbErr: any) {
    logger.error('Failed saving restaurant_subaccounts record', dbErr?.message ?? dbErr);
    // optionally, you may want to rollback the chapa subaccount if DB save fails — implement if needed
    throw new Error('Failed saving subaccount record to DB');
  }
}


  async verifyTxRef(tx_ref: string) {
    const verifyResp = await this.chapa.verifyTransaction(tx_ref);
    const payment = await this.paymentRepo.findOne({ where: { tx_ref } });
    if (payment) {
      const status = verifyResp?.data?.status ?? verifyResp?.status ?? null;
      if (status === 'success' || status === 'PAID' || status === 'SUCCESS') {
        payment.status = 'paid';
        payment.chapa_tx_id = verifyResp?.data?.id ?? payment.chapa_tx_id;
        payment.payment_data = verifyResp;
        await this.paymentRepo.save(payment);
      }
    }
    return verifyResp;
  }

  async refund(payload: any) {
    const resp = await this.chapa.refundTransaction(payload);
    return resp;
  }

//Create Aggregate payout
async createAggregatedBatch(opts: {
  olderThan?: Date;
  restaurantIds?: string[];
  minTotal?: number;
  createdBy: string;
}): Promise<PayoutBatch> {
  return this.dataSource.transaction(async (manager) => {
    const payoutItemRepo = manager.getRepository(PayoutItem);
    const batchRepo = manager.getRepository(PayoutBatch);
    const subRepo = manager.getRepository(RestaurantSubaccount);

    // create batch record
    const batchEntity = batchRepo.create({
      status: 'created',
      total_amount: 0,
      meta: { created_by: opts.createdBy },
    } as any);

    // save may return entity or array (handle both)
    const savedBatchRes = await batchRepo.save(batchEntity);
    const savedBatch = Array.isArray(savedBatchRes) ? savedBatchRes[0] : savedBatchRes;

    // build query to group pending promo_topup items by restaurant
    const qb = payoutItemRepo
      .createQueryBuilder('pi')
      .select('pi.restaurant_id', 'restaurant_id')
      .addSelect('ARRAY_AGG(pi.id)', 'child_ids')
      .addSelect('SUM(pi.amount)', 'total_amount')
      .where("pi.status = 'pending' AND pi.reason = 'promo_platform_topup'")
      .groupBy('pi.restaurant_id');

    if (opts.olderThan) qb.andWhere('pi.created_at <= :olderThan', { olderThan: opts.olderThan });
    if (opts.restaurantIds && opts.restaurantIds.length) qb.andWhere('pi.restaurant_id IN (:...rids)', { rids: opts.restaurantIds });

    const rawRows: any[] = await qb.getRawMany();

    // normalize rows: ensure child_ids is an array of strings and total_amount is a number
    const rows = rawRows.map((r) => {
      // child_ids may come as string like "{id1,id2}" depending on driver — normalize to string[]
      let child_ids: string[] = [];
      if (Array.isArray(r.child_ids)) {
        child_ids = r.child_ids;
      } else if (typeof r.child_ids === 'string') {
        // strip braces and split by comma, handle empty gracefully
        const trimmed = r.child_ids.replace(/^{|}$/g, '');
        child_ids = trimmed.length ? trimmed.split(',').map((s: string) => s.trim()) : [];
      } else {
        child_ids = [];
      }

      // total_amount may be string (from DB) or number
      const total_amount = Number(r.total_amount ?? 0);

      return {
        restaurant_id: String(r.restaurant_id),
        child_ids,
        total_amount,
      };
    });

    let total = 0;

    for (const r of rows) {
      const t = Number(r.total_amount);
      if (opts.minTotal && t < opts.minTotal) continue; // skip small totals

      // fetch restaurant bank details
      const sub = await subRepo.findOne({ where: { restaurant_id: r.restaurant_id } });
      if (!sub || !sub.account_number || !sub.bank_code || !sub.account_name) {
        // skip restaurants lacking bank details; admin must fix
        this.logger?.warn?.(`Skipping restaurant ${r.restaurant_id} - missing bank/subaccount details`);
        continue;
      }

      // create aggregated payout item
      const aggEntity = payoutItemRepo.create({
        payout_batch_id: savedBatch.id,
        order_id: null,
        restaurant_id: r.restaurant_id,
        amount: t,
        status: 'batched',
        reason: 'promo_platform_topup_aggregated',
        account_number: sub.account_number,
        account_name: sub.account_name,
        bank_code: sub.bank_code,
        meta: { child_item_ids: r.child_ids },
      } as any);

      // save and normalize save return (could be entity or array)
      const savedAggRes = await payoutItemRepo.save(aggEntity);
      const savedAgg = Array.isArray(savedAggRes) ? savedAggRes[0] : savedAggRes;

      // update child items to link to aggregated item
      if (r.child_ids && r.child_ids.length) {
        await payoutItemRepo
          .createQueryBuilder()
          .update()
          .set({ status: 'batched', payout_batch_id: savedBatch.id, parent_item_id: savedAgg.id })
          .where('id = ANY(:ids)', { ids: r.child_ids })
          .execute();
      }

      total += t;
    }

    // finalize batch totals and save (normalize save result)
    savedBatch.total_amount = total;
    const finalBatchRes = await batchRepo.save(savedBatch);
    const finalBatch = Array.isArray(finalBatchRes) ? finalBatchRes[0] : finalBatchRes;

    return finalBatch;
  });
}


// Copy-paste into your PaymentsService class
// Method: processAggregatedBatch
// Dependencies (must exist on `this`):
//  - this.payoutBatchRepo, this.payoutItemRepo : repositories
//  - this.chapa.createTransfer or chapa.bulkTransfer: provider client to perform bank transfers
//  - this.kafka : KafkaProvider to emit events

// async processAggregatedBatch(batchId: string) {
//   const batch = await this.payoutBatchRepo.findOne({ where: { id: batchId } });
//   if (!batch) throw new Error('batch not found');
//   if (batch.status !== 'created' && batch.status !== 'failed') return batch;

//   batch.status = 'processing';
//   await this.payoutBatchRepo.save(batch);

//   // find aggregated items in the batch
//   const aggregatedItems = await this.payoutItemRepo.find({ where: { payout_batch_id: batchId, reason: 'promo_platform_topup_aggregated' } });

//   for (const agg of aggregatedItems) {
//     if (agg.status !== 'batched') continue;

//     try {
//       const reference = `payout-agg-${agg.id}`;

//       // validate bank details
//       if (!agg.account_number || !agg.account_name || !agg.bank_code) {
//         agg.status = 'failed';
//         agg.last_error = 'missing_bank_details';
//         await this.payoutItemRepo.save(agg);
//         continue;
//       }

//       // perform transfer via Chapa (single transfer per restaurant aggregated item)
//       // adapt to your Chapa client API; below assumes createTransfer returns { data: { id: '...' }, ... }
//       const resp = await this.chapa.createTransfer({
//         amount: agg.amount,
//         currency: process.env.PAYOUT_CURRENCY ?? 'ETB',
//         account_number: agg.account_number,
//         account_name: agg.account_name,
//         bank_code: agg.bank_code,
//         reference,
//         metadata: { batch_id: batchId, aggregated_item_id: agg.id },
//       });

//       agg.provider_transfer_id = resp?.data?.id ?? resp?.id ?? null;
//       agg.provider_response = resp;
//       agg.status = 'paid';
//       agg.attempt_count = (agg.attempt_count ?? 0) + 1;
//       await this.payoutItemRepo.save(agg);

//       // mark child items as paid and attach provider info
//       const childIds: string[] = agg.meta?.child_item_ids ?? [];
//       if (childIds.length) {
//         await this.payoutItemRepo.createQueryBuilder()
//           .update()
//           .set({ status: 'paid', provider_transfer_id: agg.provider_transfer_id, provider_response: agg.provider_response })
//           .where('id = ANY(:ids)', { ids: childIds })
//           .execute();
//       }
//     } catch (err) {
//       agg.status = 'failed';
//       agg.last_error = err?.message ?? String(err);
//       agg.attempt_count = (agg.attempt_count ?? 0) + 1;
//       await this.payoutItemRepo.save(agg);
//     }
//   }

//   // recompute batch final state
//   const allItems = await this.payoutItemRepo.find({ where: { payout_batch_id: batchId } });
//   batch.status = allItems.every((i) => i.status === 'paid') ? 'completed' : 'failed';
//   batch.total_amount = allItems.reduce((s, it) => s + Number(it.amount), 0);
//   batch.processed_at = new Date();
//   await this.payoutBatchRepo.save(batch);

//   try {
//     await this.kafka.emit('payout.batch.completed', { batchId: batch.id, status: batch.status, provider_batch_id: batch.provider_batch_id });
//   } catch (e) {
//     this.logger.warn('Failed to emit payout.batch.completed', e?.message ?? e);
//   }

//   return batch;
// }

}
