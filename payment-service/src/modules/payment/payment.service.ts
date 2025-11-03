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
// import { PayoutItem } from 'src/entities/payout-item.entity';
import { AggregatedPayout } from 'src/entities/aggregated-payout.entity';
import { PayoutChild } from 'src/entities/payout-children.entity';
import { PayoutBatch } from 'src/entities/payout-batch.entity';
import * as crypto from 'crypto';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  
  constructor(
    @InjectRepository(Payment) private readonly paymentRepo: Repository<Payment>,
    // @InjectRepository(PayoutItem) private readonly payoutItemRepo: Repository<PayoutItem>,
    @InjectRepository(PayoutChild) private readonly payoutChildRepo: Repository<PayoutChild>,
    // @InjectRepository(PayoutBatch) private readonly payoutBatchRepo: Repository<PayoutBatch>,
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
// async handleChapaWebhook(rawBody: Buffer | undefined, signatureHeader?: string): Promise<void> {
//   const logger = this.logger ?? new (require('@nestjs/common').Logger)('PaymentsService');
//   const { BadRequestException } = require('@nestjs/common');
//   const crypto = require('crypto');

//   const secret = process.env.CHAPA_WEBHOOK_SECRET;
//   if (!secret) {
//     logger.error('CHAPA_WEBHOOK_SECRET not configured');
//     throw new Error('Server misconfiguration');
//   }

//   // Validate raw body & signature header presence
//   if (!rawBody || !(rawBody instanceof Buffer)) {
//     logger.warn('Missing rawBody in webhook request');
//     throw new BadRequestException('raw body required');
//   }
//   if (!signatureHeader) {
//     logger.warn('Missing signature header');
//     throw new BadRequestException('signature header required');
//   }

//   // Normalize signature header (support "sha256=..." prefix)
//   let sigToken = signatureHeader.trim();
//   if (/^sha256=/i.test(sigToken)) sigToken = sigToken.split('=')[1];

//   // Compute HMAC and verify
//   const computed = crypto.createHmac('sha256', secret).update(rawBody).digest();
//   let sigBuf: Buffer | null = null;
//   if (/^[0-9a-f]{64}$/i.test(sigToken)) {
//     sigBuf = Buffer.from(sigToken, 'hex');
//   } else {
//     try {
//       sigBuf = Buffer.from(sigToken, 'base64');
//     } catch {
//       sigBuf = null;
//     }
//   }
//   if (!sigBuf) {
//     logger.warn('Unable to parse signature header (not hex or base64)');
//     throw new BadRequestException('invalid signature format');
//   }
//   if (sigBuf.length !== computed.length) {
//     logger.warn('Signature length mismatch', { expected: computed.length, got: sigBuf.length });
//     throw new BadRequestException('invalid signature');
//   }
//   if (!crypto.timingSafeEqual(computed, sigBuf)) {
//     logger.warn('Invalid webhook signature (timingSafeEqual failed)');
//     throw new BadRequestException('Invalid webhook signature');
//   }

//   // Parse payload
//   let payload: any;
//   try {
//     payload = JSON.parse(rawBody.toString('utf8'));
//   } catch (e) {
//     logger.error('Failed to parse webhook JSON', e?.message ?? e);
//     throw new BadRequestException('invalid json');
//   }

//   logger.log('Valid webhook received');
//   logger.debug('webhook payload:', payload);

//   // Accept multiple shapes for tx_ref
//   const tx_ref = payload?.tx_ref ?? payload?.data?.tx_ref ?? payload?.data?.reference ?? null;
//   if (!tx_ref) {
//     logger.warn('tx_ref missing in webhook payload', payload);
//     throw new BadRequestException('tx_ref missing');
//   }

//   // Find saved payment by tx_ref
//   const payment = await this.paymentRepo.findOne({ where: { tx_ref } });
//   if (!payment) {
//     logger.warn(`No payment found for tx_ref ${tx_ref}`);
//     // ack webhook but do nothing else
//     return;
//   }

//   // Idempotent: ignore already-paid
//   if (payment.status === 'paid') {
//     logger.log(`Webhook for already-paid payment ${tx_ref} ignored`);
//     return;
//   }

//   // Verify transaction with Chapa
//   let verifyResp: any;
//   try {
//     verifyResp = await this.chapa.verifyTransaction(tx_ref);
//   } catch (err: any) {
//     logger.error('Chapa verify failed', err?.response?.data ?? err?.message ?? err);
//     // don't change DB state on verify failure; allow retries
//     return;
//   }

//   logger.debug('Chapa verify response', verifyResp);

//   // Normalize status
//   const statusRaw = verifyResp?.data?.status ?? verifyResp?.status ?? null;
//   const status = typeof statusRaw === 'string' ? statusRaw.toLowerCase() : null;

//   if (status === 'success' || status === 'paid' || status === 'ok') {
//     // Mark payment paid
//     payment.status = 'paid';
//     payment.chapa_tx_id = verifyResp?.data?.id ?? payment.chapa_tx_id;
//     payment.payment_data = verifyResp;
//     payment.paid_at = new Date();
//     await this.paymentRepo.save(payment);

//     // Emit payment.success eventngotngron
//     try {
//       await this.kafka.emit('payment.success', {
//         order_id: payment.order_id,
//         tx_ref: payment.tx_ref,
//         chapa_tx_id: payment.chapa_tx_id,
//         amount: payment.amount,
//         payment_data: verifyResp,
//       });
//     } catch (e) {
//       logger.warn('Failed to emit payment.success', e?.message ?? e);
//     }

//     // ----------------------------
//     // Determine platformTopupNeeded and restaurantId — NO Catalog fetch
//     // Priority:
//     // 1) verifyResp.data.meta (Chapa verify payload)
//     // 2) verifyResp.meta
//     // 3) payment.payment_data.initResp.meta (what we saved when initiating)
//     // 4) payment.payment_data.platform_topup_needed / payment.payment_data.restaurant_id
//     // ----------------------------
//     const metaFromVerify =
//       verifyResp?.data?.meta ??
//       verifyResp?.meta ??
//       verifyResp?.data?.data?.meta ??
//       null;

//     let platformTopupNeeded: any = metaFromVerify?.platform_topup_needed ?? null;
//     let restaurantIdFromMeta: string | null = metaFromVerify?.restaurant_id ?? null;

//     if (!platformTopupNeeded) {
//       platformTopupNeeded =
//         payment.payment_data?.initResp?.meta?.platform_topup_needed ??
//         payment.payment_data?.platform_topup_needed ??
//         null;
//     }
//     if (!restaurantIdFromMeta) {
//       restaurantIdFromMeta =
//         payment.payment_data?.initResp?.meta?.restaurant_id ??
//         payment.payment_data?.restaurant_id ??
//         null;
//     }

//     // Normalize platformTopupNeeded
//     if (typeof platformTopupNeeded === 'string') {
//       const parsed = Number(platformTopupNeeded);
//       platformTopupNeeded = Number.isFinite(parsed) ? parsed : null;
//     }
//     if (platformTopupNeeded !== null) platformTopupNeeded = Number(platformTopupNeeded);

//     const restaurantId = restaurantIdFromMeta ?? null;

//     // If there's a platform top-up > 0, create payout item with bank details (if available)
//     if (platformTopupNeeded && Number(platformTopupNeeded) > 0) {
//       // Idempotency check
//       const existingPayout = await this.payoutChildRepo.findOne({
//         where: { order_id: payment.order_id, reason: 'promo_platform_topup' },
//       });

//       if (!existingPayout) {
//         if (!restaurantId) {
//           logger.warn(
//             `Platform topup needed (${platformTopupNeeded}) for order ${payment.order_id} but restaurant_id is missing in webhook/meta/payment_data — skipping payout item creation.`,
//           );
//         } else {
//           // Fetch restaurant subaccount to copy bank details (if exists)
//           let subRec: any = null;
//           try {
//             if (!this.subRepo) {
//               logger.warn('Restaurant subRepo not available on PaymentsService; cannot fetch bank details.');
//             } else {
//               subRec = await this.subRepo.findOne({ where: { restaurant_id: restaurantId } });
//             }
//           } catch (e) {
//             logger.warn('Failed fetching restaurant subaccount for bank details', (e as any)?.message ?? e);
//             subRec = null;
//           }

//           // Build payout item payload, copying bank details if present
//           const piPayload: any = {
//             order_id: payment.order_id,
//             payment_id: payment.id,
//             restaurant_id: restaurantId,
//             amount: Number(platformTopupNeeded),
//             status: 'pending',
//             reason: 'promo_platform_topup',
//             meta: { tx_ref: payment.tx_ref, created_via: 'chapa_webhook' },
//           };

//           if (subRec) {
//             piPayload.account_number = subRec.account_number ?? null;
//             piPayload.account_name = subRec.account_name ?? null;
//             piPayload.bank_code = subRec.bank_code ?? null;
//           } else {
//             // keep them null if subaccount not found — admin should populate later
//             piPayload.account_number = null;
//             piPayload.account_name = null;
//             piPayload.bank_code = null;
//           }

//           // Persist payout item (normalize save result)
//           // const piEntity = this.payoutItemRepo.create(piPayload as any);
//           // const savedResult = await this.payoutItemRepo.save(piEntity);
//           const piEntity = this.payoutChildRepo.create(piPayload as any);
//           const savedResult = await this.payoutChildRepo.save(piEntity);
//           const savedPi = Array.isArray(savedResult) ? savedResult[0] : savedResult;

//           // logger.log(`Created payout_item ${savedPi.id} for order ${payment.order_id} amount=${savedPi.amount} (bank: ${savedPi.account_number ?? 'none'})`);
//           logger.log(`Created payout_item ${savedPi.id} for order ${payment.order_id} amount=${savedPi.amount}`);
//         }
//       } else {
//         logger.log(`PayoutItem already exists for order ${payment.order_id}, skipping creation`);
//       }
//     } else {
//       logger.debug(`No platform_topup_needed for order ${payment.order_id} (value: ${platformTopupNeeded})`);
//     }

//     return;
//   }

//   // non-success: mark payment failed and emit event
//   payment.status = 'failed';
//   payment.payment_data = verifyResp;
//   await this.paymentRepo.save(payment);

//   try {
//     await this.kafka.emit('payment.failed', {
//       order_id: payment.order_id,
//       tx_ref: payment.tx_ref,
//       reason: 'chapa_status_not_success',
//       payment_data: verifyResp,
//     });
//   } catch (e) {
//     logger.warn('Failed to emit payment.failed', e?.message ?? e);
//   }

//   return;
// }

//Handle webhook
 async handleChapaWebhook(rawBody: Buffer | undefined, signatureHeader?: string): Promise<void> {
  const logger = this.logger ?? new (require('@nestjs/common').Logger)('PaymentsService');
  const { BadRequestException } = require('@nestjs/common');
  const crypto = require('crypto');

  // 1) signature verification (HMAC SHA256)
  // const secret = process.env.CHAPA_WEBHOOK_SECRET;
  const secret = process.env.PROD_CHAPA_SECRET;
  if (!secret) {
    logger.error('CHAPA_WEBHOOK_SECRET not configured');
    throw new Error('Server misconfiguration');
  }
  if (!rawBody || !(rawBody instanceof Buffer)) {
    logger.warn('Missing rawBody in webhook request');
    throw new BadRequestException('raw body required');
  }
  if (!signatureHeader) {
    logger.warn('Missing signature header');
    throw new BadRequestException('signature header required');
  }

  let sigToken = signatureHeader.trim();
  if (/^sha256=/i.test(sigToken)) sigToken = sigToken.split('=')[1];

  const computed = crypto.createHmac('sha256', secret).update(rawBody).digest();
  let sigBuf: Buffer | null = null;
  if (/^[0-9a-f]{64}$/i.test(sigToken)) sigBuf = Buffer.from(sigToken, 'hex');
  else {
    try { sigBuf = Buffer.from(sigToken, 'base64'); } catch (e) { sigBuf = null; }
  }

  if (!sigBuf) {
    logger.warn('Unable to parse signature header (not hex or base64)');
    throw new BadRequestException('invalid signature format');
  }
  if (sigBuf.length !== computed.length || !crypto.timingSafeEqual(computed, sigBuf)) {
    logger.warn('Invalid webhook signature (timingSafeEqual failed)');
    throw new BadRequestException('Invalid webhook signature');
  }

  // 2) parse payload
  let payload: any;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch (e) {
    logger.error('Failed to parse webhook JSON', e?.message ?? e);
    throw new BadRequestException('invalid json');
  }

  logger.log('Valid webhook received from Chapa');
  logger.debug('webhook payload:', payload);

  // 3) detect event type (payment vs transfer)
  const tx_ref = payload?.tx_ref ?? payload?.data?.tx_ref ?? payload?.data?.reference ?? null;
  const isPaymentEvent = Boolean(tx_ref) || (typeof payload?.event === 'string' && payload.event.toLowerCase().includes('charge'));
  const hasTransferResults = Array.isArray(payload?.results) || Boolean(payload?.data?.id) || Boolean(payload?.transfer) || Boolean(payload?.transfer_id);

  // ---------- PAYMENT FLOW ----------
  if (isPaymentEvent) {
    try {
      const txRef = tx_ref;
      if (!txRef) {
        logger.warn('Payment webhook missing tx_ref; ignoring payment path');
        return;
      }

      // find payment record
      const payment = await this.paymentRepo.findOne({ where: { tx_ref: txRef } });
      if (!payment) {
        logger.warn(`No payment found for tx_ref ${txRef}; ignoring`);
        return;
      }

      if (payment.status === 'paid') {
        logger.log(`Payment ${txRef} already paid; ignoring webhook`);
        return;
      }

      // verify transaction with Chapa (best-practice)
      let verifyResp: any = null;
      try {
        verifyResp = await this.chapa.verifyTransaction(txRef);
      } catch (e) {
        logger.error('Chapa verifyTransaction failed', e?.message ?? e);
        // don't change DB state on verify error; ack webhook
        return;
      }

      const statusRaw = verifyResp?.data?.status ?? verifyResp?.status ?? payload?.status ?? '';
      const status = String(statusRaw).toLowerCase();

      if (['success', 'paid', 'completed'].includes(status)) {
        // mark payment paid
        payment.status = 'paid';
        payment.chapa_tx_id = verifyResp?.data?.id ?? payment.chapa_tx_id;
        payment.payment_data = verifyResp;
        payment.paid_at = new Date();
        await this.paymentRepo.save(payment);

        // emit payment.success event (existing behavior)
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

        // If platform_topup_needed present, create a payout child (idempotent)
        const platformTopup =
          Number(
            verifyResp?.data?.meta?.platform_topup_needed ??
              verifyResp?.meta?.platform_topup_needed ??
              payment.payment_data?.initResp?.meta?.platform_topup_needed ??
              payment.payment_data?.platform_topup_needed ??
              0,
          ) || 0;

        if (platformTopup > 0) {
          // Determine restaurant_id from available meta spots (we DO NOT query catalog)
          const restaurantId =
            verifyResp?.data?.meta?.restaurant_id ??
            verifyResp?.meta?.restaurant_id ??
            payment.payment_data?.initResp?.meta?.restaurant_id ??
            payment.payment_data?.meta?.restaurant_id ??
            null;

          if (!restaurantId) {
            logger.warn(`Cannot create payout child for order ${payment.order_id}: restaurant_id missing in payment meta`);
          } else {
            // Idempotency: ensure we don't create duplicate child for the same order+reason
            const existing = await this.payoutChildRepo.findOne({
              where: { order_id: payment.order_id, reason: 'promo_platform_topup' },
            });
            if (existing) {
              logger.log(`Payout child already exists for order ${payment.order_id} (id=${existing.id}), skipping creation`);
            } else {
              const childEntity = this.payoutChildRepo.create({
                order_id: payment.order_id,
                payment_id: payment.id,
                restaurant_id: restaurantId,
                amount: platformTopup,
                status: 'pending',
                reason: 'promo_platform_topup',
                meta: { tx_ref: payment.tx_ref, created_from: 'webhook' },
              } as any);

              const savedRaw = await this.payoutChildRepo.save(childEntity);
              const savedChild = Array.isArray(savedRaw) ? (savedRaw as any)[0] : (savedRaw as any);
              logger.log(`Created payout_child ${savedChild.id} for order ${payment.order_id} amount=${savedChild.amount}`);
            }
          }
        }

        return;
      } else {
        // non-success -> mark failed and emit
        payment.status = 'failed';
        payment.payment_data = verifyResp ?? payload;
        await this.paymentRepo.save(payment);

        try {
          await this.kafka.emit('payment.failed', {
            order_id: payment.order_id,
            tx_ref: payment.tx_ref,
            reason: 'chapa_status_not_success',
            payment_data: verifyResp ?? payload,
          });
        } catch (e) {
          logger.warn('Failed to emit payment.failed', e?.message ?? e);
        }
        return;
      }
    } catch (err) {
      logger.error('Error handling payment webhook', err?.message ?? err);
      return;
    }
  }

  // ---------- BULK TRANSFER / AGGREGATED PAYOUT FLOW ----------
  if (hasTransferResults) {
    // normalize results array from several possible shapes
    const results: any[] = [];
    if (Array.isArray(payload?.results)) results.push(...payload.results);
    else if (Array.isArray(payload?.data?.results)) results.push(...payload.data.results);
    else if (payload?.data && payload.data.id) results.push(payload.data);
    else if (payload?.transfer) results.push(payload.transfer);
    else if (payload?.id || payload?.transfer_id) results.push(payload);

    if (results.length === 0) {
      logger.warn('Bulk webhook contained no transfer results; ignoring');
      return;
    }

    for (const r of results) {
      const providerTransferId = r.transfer_id ?? r.id ?? r.tx_id ?? null;
      const reference = r.reference ?? r.metadata?.payout_item_id ?? r.metadata?.reference ?? null;
      const statusRaw = (r.status ?? r.state ?? r.result ?? '').toString().toLowerCase();
      const isSuccess = ['success', 'paid', 'completed'].includes(statusRaw);
      const isFailed = ['failed', 'error', 'rejected', 'cancelled'].includes(statusRaw);
      const fee = r.fee ? Number(r.fee) : null;
      const error = r.error ?? r.failure_reason ?? null;
      const providerBatchId = payload.provider_batch_id ?? payload.data?.provider_batch_id ?? payload.batch_id ?? null;

      try {
        await this.dataSource.transaction(async (manager) => {
          const aggRepo = manager.getRepository(AggregatedPayout);
          const childRepo = manager.getRepository(PayoutChild);
          const batchRepo = manager.getRepository(PayoutBatch);

          // locate aggregated payout (prefer provider_transfer_id, then reference/payout_item_id)
          let agg: any = null;
          if (providerTransferId) {
            agg = await aggRepo.findOne({ where: { provider_transfer_id: providerTransferId } });
          }
          if (!agg && reference) {
            agg = await aggRepo.findOne({ where: { id: reference } }).catch(() => null);
          }
          if (!agg && r.metadata?.payout_item_id) {
            agg = await aggRepo.findOne({ where: { id: r.metadata.payout_item_id } }).catch(() => null);
          }

          if (!agg) {
            logger.warn(`No aggregated_payout found for transfer providerTransferId=${providerTransferId} reference=${reference}`);
            return;
          }

          // idempotency: if already in final state and matches, skip
          if (agg.status === 'paid' && isSuccess) {
            logger.log(`Aggregated payout ${agg.id} already paid; skipping`);
            return;
          }

          // prepare update
          const updateObj: any = { provider_response: r, provider_transfer_id: providerTransferId ?? agg.provider_transfer_id ?? null };
          if (isSuccess) { updateObj.status = 'paid'; updateObj.last_error = null; }
          else if (isFailed) { updateObj.status = 'failed'; updateObj.last_error = String(error ?? 'provider_failed'); }
          else { updateObj.status = 'processing'; }

          await aggRepo.update({ id: agg.id }, updateObj);

          // refresh agg to read meta.child_ids
          const freshAgg = await aggRepo.findOne({ where: { id: agg.id } });
          if (!freshAgg) {
            logger.warn(`Aggregated payout ${agg.id} disappeared after update; skipping children update`);
            return;
          }

          const childIds: string[] = Array.isArray(freshAgg.meta?.child_ids) ? freshAgg.meta.child_ids : [];

          if (childIds && childIds.length) {
            if (isSuccess) {
              await childRepo
                .createQueryBuilder()
                .update()
                .set({ status: 'paid', meta: () => `jsonb_set(coalesce(meta,'{}'::jsonb), '{paid_via}', to_jsonb('${providerTransferId ?? ''}'))` })
                .where('id = ANY(:ids)', { ids: childIds })
                .execute();
            } else if (isFailed) {
              await childRepo
                .createQueryBuilder()
                .update()
                .set({ status: 'failed', meta: () => `jsonb_set(coalesce(meta,'{}'::jsonb), '{last_error}', to_jsonb('${String(error ?? 'provider_failed')}'))` })
                .where('id = ANY(:ids)', { ids: childIds })
                .execute();
            } else {
              // processing -> leave child status as-is (batched)
            }
          }

          // update parent batch summary if present
          if (freshAgg.payout_batch_id) {
            const batch = await batchRepo.findOne({ where: { id: freshAgg.payout_batch_id } });
            if (batch) {
              const aggRows = await aggRepo.find({ where: { payout_batch_id: batch.id } });
              const allPaid = aggRows.every((aa) => aa.status === 'paid');
              const anyFailed = aggRows.some((aa) => aa.status === 'failed');
              batch.status = allPaid ? 'completed' : anyFailed ? 'failed' : 'processing';
              batch.total_amount = aggRows.reduce((s, it) => s + Number(it.amount ?? 0), 0);
              batch.processed_at = allPaid || anyFailed ? new Date() : batch.processed_at;
              batch.meta = { ...(batch.meta ?? {}), last_provider_callback: new Date().toISOString(), provider_batch_id: providerBatchId ?? batch.provider_batch_id };
              await batchRepo.save(batch);

              try {
                await this.kafka.emit('payout.batch.updated', { batch_id: batch.id, status: batch.status, provider_batch_id: batch.provider_batch_id });
              } catch (e) {
                logger.warn('Failed emit payout.batch.updated', e?.message ?? e);
              }
            }
          }

          // emit per-agg event
          try {
            if (isSuccess) await this.kafka.emit('payout.item.paid', { payout_item_id: freshAgg.id, restaurant_id: freshAgg.restaurant_id, amount: freshAgg.amount, provider_transfer_id: providerTransferId, fee });
            else if (isFailed) await this.kafka.emit('payout.item.failed', { payout_item_id: freshAgg.id, restaurant_id: freshAgg.restaurant_id, amount: freshAgg.amount, error });
            else await this.kafka.emit('payout.item.updated', { payout_item_id: freshAgg.id, status: updateObj.status });
          } catch (e) {
            logger.warn('Failed to emit payout.item event', e?.message ?? e);
          }
        }); // end transaction for this result
      } catch (txErr) {
        logger.error('Failed to process transfer result in transaction', txErr?.message ?? txErr, { result: r });
        // swallow and continue so webhook can be acked; provider may retry
        continue;
      }
    } // end for results

    return;
  }

  // neither path matched
  logger.warn('Webhook payload did not match payment or transfer shapes; ignoring');
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
async createAggregatedBatch(opts: { olderThan?: Date; restaurantIds?: string[]; minTotal?: number; createdBy: string }) {
  return this.dataSource.transaction(async (manager) => {
    const childRepo = manager.getRepository(PayoutChild);
    const aggRepo = manager.getRepository(AggregatedPayout);
    const batchRepo = manager.getRepository(PayoutBatch);
    const subRepo = manager.getRepository(RestaurantSubaccount);

    // create batch
    const batchEntity = batchRepo.create({ status: 'created', total_amount: 0, meta: { created_by: opts.createdBy } } as any);
    const savedBatchRaw = await batchRepo.save(batchEntity);
    // normalize save() return (some drivers/typing may return entity or [entity])
    const savedBatch: PayoutBatch = Array.isArray(savedBatchRaw) ? (savedBatchRaw as any)[0] : (savedBatchRaw as any);

    // build query grouping children by restaurant
    let qb = childRepo
      .createQueryBuilder('pc')
      .select('pc.restaurant_id', 'restaurant_id')
      .addSelect('ARRAY_AGG(pc.id)', 'child_ids')
      .addSelect('SUM(pc.amount)', 'total_amount')
      .where("pc.status = 'pending' AND pc.reason = 'promo_platform_topup'")
      .groupBy('pc.restaurant_id');

    if (opts.olderThan) qb = qb.andWhere('pc.created_at <= :olderThan', { olderThan: opts.olderThan });
    if (opts.restaurantIds && opts.restaurantIds.length) qb = qb.andWhere('pc.restaurant_id IN (:...rids)', { rids: opts.restaurantIds });

    const rawRows: any[] = await qb.getRawMany();

    // normalize rows
    const rows = rawRows.map((r) => {
      let child_ids: string[] = [];
      if (Array.isArray(r.child_ids)) child_ids = r.child_ids;
      else if (typeof r.child_ids === 'string') {
        const t = r.child_ids.replace(/^{|}$/g, '').trim();
        child_ids = t.length ? t.split(',').map((s: string) => s.trim()) : [];
      }
      return { restaurant_id: String(r.restaurant_id), child_ids, total_amount: Number(r.total_amount ?? 0) };
    });

    let total = 0;

    for (const r of rows) {
      const t = Number(r.total_amount);
      if (opts.minTotal && t < opts.minTotal) continue;

      // fetch bank/subaccount for restaurant
      const sub = await subRepo.findOne({ where: { restaurant_id: r.restaurant_id } });
      if (!sub || !sub.account_number || !sub.account_name || !sub.bank_code) {
        this.logger.warn(`Skipping restaurant ${r.restaurant_id} - missing bank/subaccount details`);
        continue;
      }

      // create aggregated payout (parent)
      const aggEntity = aggRepo.create({
        payout_batch_id: savedBatch.id,
        restaurant_id: r.restaurant_id,
        amount: t,
        status: 'batched',
        account_number: sub.account_number,
        account_name: sub.account_name,
        bank_code: sub.bank_code,
        meta: { child_ids: r.child_ids },
      } as any);

      const savedAggRaw = await aggRepo.save(aggEntity);
      const savedAgg: AggregatedPayout = Array.isArray(savedAggRaw) ? (savedAggRaw as any)[0] : (savedAggRaw as any);

      // link children to parent (use savedAgg.id which is now guaranteed)
      if (r.child_ids && r.child_ids.length) {
        await childRepo
          .createQueryBuilder()
          .update()
          .set({ status: 'batched', parent_aggregate_id: savedAgg.id })
          .where('id = ANY(:ids)', { ids: r.child_ids })
          .execute();
      }

      total += t;
    }

    // finalize and save batch (normalize again)
    savedBatch.total_amount = total;
    const finalBatchRaw = await batchRepo.save(savedBatch);
    const finalBatch: PayoutBatch = Array.isArray(finalBatchRaw) ? (finalBatchRaw as any)[0] : (finalBatchRaw as any);

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
//   const logger = this.logger;

//   // 1) mark batch as processing (optimistic lock style)
//   const batchRepo = this.dataSource.getRepository(PayoutBatch);
//   const aggRepo = this.dataSource.getRepository(AggregatedPayout);
//   const childRepo = this.dataSource.getRepository(PayoutChild);

//   const batch = await batchRepo.findOne({ where: { id: batchId } });
//   if (!batch) throw new Error('Batch not found');
//   if (batch.status === 'processing') throw new Error('Batch already processing');

//   batch.status = 'processing';
//   batch.attempt_count = (batch.attempt_count ?? 0) + 1;
//   await batchRepo.save(batch);

//   // 2) load all aggregated payouts for this batch that are ready
//   const aggs = await aggRepo.find({ where: { payout_batch_id: batchId, status: 'batched' } });
//   if (!aggs || aggs.length === 0) {
//     logger.warn(`No aggregated payouts to process for batch ${batchId}`);
//     batch.status = 'completed';
//     batch.processed_at = new Date();
//     await batchRepo.save(batch);
//     return batch;
//   }

//   // mark aggs processing
//   const aggIds = aggs.map((a) => a.id);
//   await aggRepo
//     .createQueryBuilder()
//     .update()
//     .set({ status: 'processing', attempt_count: () => 'attempt_count + 1' })
//     .where('id = ANY(:ids)', { ids: aggIds })
//     .execute();

//   // build transfers (one per aggregated payout)
//   const transfers = aggs.map((a) => ({
//     payout_item_id: a.id,
//     account_number: a.account_number,
//     account_name: a.account_name,
//     bank_code: a.bank_code,
//     amount: Number(a.amount),
//     currency: 'ETB',
//     metadata: { payout_item_id: a.id, child_ids: a.meta?.child_ids ?? [] },
//   }));

//   let providerResp: any;
//   try {
//     // assume chapa.bulkTransfer returns { provider_batch_id, results: [{ payout_item_id, status, transfer_id, error, fee }] }
//     providerResp = await this.chapa.bulkTransfer({ transfers, reference: batchId });
//   } catch (err) {
//     logger.error('Chapa bulk transfer failed', err?.message ?? err);

//     // mark aggs failed
//     await aggRepo
//       .createQueryBuilder()
//       .update()
//       .set({ status: 'failed', last_error: String(err?.message ?? err) })
//       .where('id = ANY(:ids)', { ids: aggIds })
//       .execute();

//     batch.status = 'failed';
//     batch.meta = { ...(batch.meta ?? {}), provider_error: err?.message ?? String(err) };
//     batch.processed_at = new Date();
//     await batchRepo.save(batch);
//     return batch;
//   }

//   // Save provider batch id and raw response
//   batch.provider_batch_id = providerResp?.provider_batch_id ?? null;
//   batch.meta = { ...(batch.meta ?? {}), provider_response: providerResp };

//   // Map per-transfer results
//   const results: any[] = providerResp?.results ?? [];
//   const resultMap = new Map<string, any>();
//   for (const r of results) resultMap.set(String(r.payout_item_id), r);

//   // Update aggregated rows and their children accordingly
//   for (const a of aggs) {
//     const res = resultMap.get(a.id);
//     if (!res) {
//       // No immediate per-transfer result -> leave as processing for async webhook
//       continue;
//     }

//     if (res.status === 'success' || res.status === 'paid') {
//       await aggRepo.update({ id: a.id }, { status: 'paid', provider_transfer_id: res.transfer_id ?? null, provider_response: res });

//       // mark children as paid and attach paid_via in meta
//       const childIds = a.meta?.child_ids ?? [];
//       if (childIds && childIds.length) {
//         await childRepo
//           .createQueryBuilder()
//           .update()
//           .set({ status: 'paid', meta: () => `jsonb_set(coalesce(meta,'{}'::jsonb), '{paid_via}', to_jsonb('${res.transfer_id}'))` })
//           .where('id = ANY(:ids)', { ids: childIds })
//           .execute();
//       }

//       // emit kafka event per payout item
//       try {
//         await this.kafka.emit('payout.item.paid', { payout_item_id: a.id, restaurant_id: a.restaurant_id, amount: a.amount, provider_transfer_id: res.transfer_id });
//       } catch (e) {
//         logger.warn('Failed to emit payout.item.paid', e?.message ?? e);
//       }
//     } else {
//       // failed
//       await aggRepo.update({ id: a.id }, { status: 'failed', last_error: res.error ?? 'provider_failed', provider_response: res });

//       const childIds = a.meta?.child_ids ?? [];
//       if (childIds && childIds.length) {
//         await childRepo
//           .createQueryBuilder()
//           .update()
//           .set({ status: 'failed', meta: () => `jsonb_set(coalesce(meta,'{}'::jsonb), '{last_error}', to_jsonb('${String(res.error ?? 'provider_failed')}'))` })
//           .where('id = ANY(:ids)', { ids: childIds })
//           .execute();
//       }

//       try {
//         await this.kafka.emit('payout.item.failed', { payout_item_id: a.id, restaurant_id: a.restaurant_id, amount: a.amount, error: res.error });
//       } catch (e) {
//         logger.warn('Failed to emit payout.item.failed', e?.message ?? e);
//       }
//     }
//   }

//   // compute final batch status
//   const updatedAggs = await aggRepo.find({ where: { payout_batch_id: batchId } });
//   const total = updatedAggs.reduce((s, it) => s + Number(it.amount ?? 0), 0);
//   const allPaid = updatedAggs.every((it) => it.status === 'paid');
//   const anyFailed = updatedAggs.some((it) => it.status === 'failed');

//   batch.total_amount = total;
//   batch.processed_at = new Date();
//   batch.status = allPaid ? 'completed' : anyFailed ? 'failed' : 'processing';

//   await batchRepo.save(batch);

//   // emit batch event
//   try {
//     await this.kafka.emit('payout.batch.processed', { batch_id: batch.id, provider_batch_id: batch.provider_batch_id, total_amount: batch.total_amount, status: batch.status });
//   } catch (e) {
//     logger.warn('Failed to emit payout.batch.processed', e?.message ?? e);
//   }

//   return batch;
// }
}
