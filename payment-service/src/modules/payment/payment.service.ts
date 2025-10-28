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
import * as crypto from 'crypto';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  
  constructor(
    @InjectRepository(Payment) private readonly paymentRepo: Repository<Payment>,
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
      // return_url,
      customer_name,
      // customer_first_name,
      // customer_last_name,
      // customer_phone,
    } = payload ?? {};

    // Basic payload validation
    if (!order_id || !amount || !customer_id || !restaurant_id) {
      this.logger.warn('Invalid order.awaiting_payment payload', { payload });
      try {
        await this.kafka.emit('payment.failed', { order_id: order_id ?? null, reason: 'invalid_payload' });
      } catch (e) {
        this.logger.warn('Failed emitting payment.failed for invalid payload', e?.message ?? e);
      }
      return null;
    }

    // Idempotency: if payment exists, re-emit appropriate event and return it.
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
        this.logger.warn('Failed emitting event for existing payment', e?.message ?? e);
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
        this.logger.warn('Failed emitting payment.failed for missing_subaccount', e?.message ?? e);
      }
      return null;
    }

    // Ensure platform chapa subaccount exists (DB or env)
    const platformChapaId = await this.getPlatformChapaId();
    if (!platformChapaId) {
      this.logger.warn(`Platform subaccount not configured (order=${order_id})`);
      try {
        await this.kafka.emit('payment.failed', { order_id, reason: 'missing_platform_subaccount' });
      } catch (e) {
        this.logger.warn('Failed emitting payment.failed for missing_platform_subaccount', e?.message ?? e);
      }
      return null;
    }

    // Generate tx_ref
    const tx_ref = this.makeTxRef(order_id);
    this.logger.log(`Generated tx_ref=${tx_ref} for order=${order_id}`);

    // Build subaccounts list with explicit typing for TS
    const subaccounts: ChapaSubaccount[] = [
      { id: restSub.chapa_subaccount_id, split_type: 'percentage', split_value: 0.95 },
      { id: platformChapaId, split_type: 'percentage', split_value: 0.05 },
    ];

    // Build form payload (URLSearchParams) for Chapa
    const formPayload = buildChapaFormPayload({
      amount,
      currency,
      tx_ref,
      // return_url: return_url ?? process.env.CHAPA_RETURN_URL ?? '',
      callback_url: '', // optional
      // email: customer_email ?? undefined,
      first_name: customer_name,
      // last_name: customer_last_name ?? undefined,
      // phone_number: customer_phone ?? undefined,
      customization: { title: 'Order payment', description: `Order ${order_id}` },
      meta: { order_id },
      subaccounts,
    });

    // Initialize transaction with Chapa
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
        this.logger.warn('Failed emitting payment.failed after chapa init failure', e?.message ?? e);
      }
      return null;
    }

    // Extract checkout URL / expires / chapa id (be resilient to shapes)
    const checkout_url =
      initResp?.data?.checkout_url ??
      initResp?.checkout_url ??
      initResp?.data?.checkoutUrl ??
      initResp?.checkoutUrl ??
      initResp?.data?.data?.checkout_url ??
      null;

    const expires_at = initResp?.data?.expires_at ?? initResp?.expires_at ?? null;
    const chapa_tx_id = initResp?.data?.id ?? initResp?.id ?? null;

    // Create Payment entity and persist. Cast to Payment and use savedPayment result.
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
          this.logger.warn('Failed emitting payment.initiated after concurrent DB save', e?.message ?? e);
        }
        return maybeExisting;
      }

      // otherwise inform orchestrator
      try {
        await this.kafka.emit('payment.failed', { order_id, tx_ref, reason: 'db_save_failed' });
      } catch (e) {
        this.logger.warn('Failed emitting payment.failed after db_save_failed', e?.message ?? e);
      }
      return null;
    }

    // Emit payment.initiated with savedPayment values (use savedPayment.payment_data safely)
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


  async handleChapaWebhook(rawBody: Buffer | undefined, signatureHeader?: string) {
  const logger = this.logger ?? new Logger('PaymentsService'); // use existing logger if available
  const secret = process.env.CHAPA_WEBHOOK_SECRET;
  if (!secret) {
    logger.error('CHAPA_WEBHOOK_SECRET not configured');
    throw new Error('Server misconfiguration');
  }

  console.log(rawBody);

  if (!rawBody || !(rawBody instanceof Buffer)) {
    logger.warn('Missing rawBody in webhook request');
    throw new BadRequestException('raw body required');
  }

  if (!signatureHeader) {
    logger.warn('Missing signature header');
    throw new BadRequestException('signature header required');
  }

  // Normalize header and extract signature token (support "sha256=..." prefix)
  let sigToken = signatureHeader.trim();
  if (/^sha256=/i.test(sigToken)) {
    sigToken = sigToken.split('=')[1];
  }

  // Compute HMAC over raw bytes
  const computed = crypto.createHmac('sha256', secret).update(rawBody).digest();

  // Try to decode signature header: prefer hex, otherwise base64
  let sigBuf: Buffer | null = null;
  if (/^[0-9a-f]{64}$/i.test(sigToken)) {
    // 64 hex chars -> 32 bytes
    sigBuf = Buffer.from(sigToken, 'hex');
  } else {
    // try base64
    try {
      sigBuf = Buffer.from(sigToken, 'base64');
    } catch (e) {
      sigBuf = null;
    }
  }

  if (!sigBuf) {
    logger.warn('Unable to parse signature header (not hex or base64)');
    throw new BadRequestException('invalid signature format');
  }

  // length must match (32 bytes for sha256)
  if (sigBuf.length !== computed.length) {
    logger.warn('Signature length mismatch', { expected: computed.length, got: sigBuf.length });
    throw new BadRequestException('invalid signature');
  }

  // constant-time comparison
  if (!crypto.timingSafeEqual(computed, sigBuf)) {
    // For debugging only: you can log a truncated sample of computed and received, but avoid logging secrets in production
    logger.warn('Invalid webhook signature (timingSafeEqual failed)');
    throw new BadRequestException('Invalid webhook signature');
  }

  // signature valid — parse payload and proceed
  let payload: any;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch (e) {
    logger.error('Failed to parse webhook JSON', e?.message ?? e);
    throw new BadRequestException('invalid json');
  }

  logger.log('Valid webhook received (tx present?)');
  console.log('pure payload: ',payload);
  console.log('payload data: ',payload?.data);

  const tx_ref = payload?.tx_ref
  if (!tx_ref) {
    logger.warn('tx_ref missing in webhook payload', payload);
    throw new BadRequestException('tx_ref missing');
  }

  const payment = await this.paymentRepo.findOne({ where: { tx_ref } });
  if (!payment) {
    logger.warn(`No payment found for tx_ref ${tx_ref}`);
    // depending on policy you may return 200 or 404 — return 200 to ack webhook but log
    return;
  }

  if (payment.status === 'paid') {
    logger.log(`Webhook for already-paid payment ${tx_ref} ignored`);
    return;
  }

  // verify with Chapa (best practice)
  let verifyResp: any;
  try {
    verifyResp = await this.chapa.verifyTransaction(tx_ref);
  } catch (e) {
    logger.error('Chapa verify failed', e?.response?.data ?? e?.message ?? e);
    // Do not change payment state on verification error; return 200 so provider doesn't retry forever, or return 500 to request retry — choose per your policy.
    return;
  }

  console.log(verifyResp);
  const status = verifyResp?.status;

  if (status === 'success' || status === 'PAID' || status === 'SUCCESS') {
    payment.status = 'paid';
    payment.chapa_tx_id = verifyResp?.data?.id ?? payment.chapa_tx_id;
    payment.payment_data = verifyResp;
    payment.paid_at = new Date();
    await this.paymentRepo.save(payment);

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

    return;
  } else {
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

  async createSubaccountInternal(restaurant_id: string, payload: CreateSubaccountDto) {
  const { business_name, account_name, bank_code, account_number, split_value, split_type, return_url } = payload;
  const chapaPayload = {
   business_name,
   account_name,
   bank_code: Number(bank_code),
   account_number: String(account_number),
   split_value: Number(split_value),
   split_type,
   return_url: return_url ?? process.env.CHAPA_RETURN_URL ?? undefined,
   };
    const resp = await this.chapa.createSubaccount(chapaPayload);
    console.log('sub-account:', resp?.data);
    const chapa_subaccount_id = resp?.data?.subaccount_id ?? resp?.id ?? null;
    if (!chapa_subaccount_id) throw new Error('Chapa subaccount creation failed');
      const r = this.subRepo.create({ restaurant_id, chapa_subaccount_id, raw: resp });
      return await this.subRepo.save(r);
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
}
