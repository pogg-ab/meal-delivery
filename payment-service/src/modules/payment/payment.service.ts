import { Injectable, Logger, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Payment } from '../../entities/payment.entity';
import { PlatformAccount } from '../../entities/platform-account.entity';
import { RestaurantSubaccount } from '../../entities/restaurant-subaccount.entity';
import { ChapaService } from './chapa.service';
import { ClientKafka } from '@nestjs/microservices';
import { KafkaProvider } from 'src/providers/kafka.provider';
import { CreateSubaccountDto } from './dtos/create-subaccount.dto';

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


  // --- helper: get platform chapa id (db first, fallback to env) ---
private async getPlatformChapaId(): Promise<string | null> {
  try {
    const rec = await this.platformRepo.findOne({ where: {} }); // there will be 0..1 rows
    if (rec && rec.chapa_subaccount_id) return rec.chapa_subaccount_id;
  } catch (e) {
    this.logger.debug('Failed to read platform account from DB', e as any);
  }
  // fallback to env var (legacy)
  return process.env.PLATFORM_SUBACCOUNT_ID ?? null;
}



// --- get platform account ---
async getPlatformAccount() {
  return await this.platformRepo.findOne({ where: {} });
}


private makeTxRef(order_id: string, maxLen = 50) {
  const prefix = 'order-';
  const ts = Date.now().toString(36); // compact timestamp
  const idPart = order_id.replace(/-/g, '').slice(0, 8);
  const reserved = prefix.length + 1 + ts.length; // prefix + '-' + timestamp
  const allowedForId = Math.max(4, maxLen - reserved); // at least 4 chars
  const shortId = idPart.slice(0, allowedForId);
  return `${prefix}${shortId}-${ts}`;
}

  // async handleOrderAwaitingPayment(payload: any) {
  //   const { order_id, amount, currency, customer_id, restaurant_id, return_url } = payload;
  //   const tx_ref = `order-${order_id}-${Date.now()}`;
    
  //   // idempotency: if payment exists for order_id, return existing init
  //   const existing = await this.paymentRepo.findOne({ where: { order_id } });
  //   if (existing) {
  //     this.logger.log(`Payment already exists for order ${order_id}`);
  //     if (existing.status === 'initiated') {
  //       const checkout_url = existing.payment_data?.data?.checkout_url ?? existing.payment_data?.checkout_url ?? existing.payment_data?.checkoutUrl ?? null;
  //       await this.kafka.emit('payment.initiated', { order_id, tx_ref: existing.tx_ref, checkout_url, expires_at: existing.payment_data?.data?.expires_at });
  //     }
  //     return;
  //   }
    
  //   // check subaccount
  //   const sub = await this.subRepo.findOne({ where: { restaurant_id } });
  //   console.log(sub);
  //   if (!sub) {
  //     await this.kafka.emit('payment.failed', { order_id, reason: 'missing_subaccount' });
  //     return;
  //   }
    
  //   // compose chapa payload with split
  //   const chapaPayload = {
  //     amount,
  //     currency,
  //     tx_ref,
  //     return_url: return_url ?? process.env.CHAPA_RETURN_URL ?? '',
  //     customer: { id: customer_id },
  //     subaccounts: [
  //       { subaccount: sub.chapa_subaccount_id, share: 95 },
  //       { subaccount: process.env.PLATFORM_SUBACCOUNT_ID, share: 5 },
  //     ],
  //     callback_url: '',
  //   };
    
  //   // initialize and persist
  //   let initResp: any;
  //   try {
  //     initResp = await this.chapa.initializeTransaction(chapaPayload);
  //   } catch (e) {
  //     this.logger.error('Chapa initialize failed', e as any);
  //     await this.kafka.emit('payment.failed', { order_id, reason: 'chapa_init_error' });
  //     return;
  //   }

  //   const checkout_url = initResp?.data?.checkout_url ?? initResp?.checkout_url ?? initResp?.checkoutUrl ?? null;
  //   const expires_at = initResp?.data?.expires_at ?? null;
    
  //   const payment = this.paymentRepo.create({
  //     order_id,
  //     tx_ref,
  //     chapa_tx_id: initResp?.data?.id ?? undefined,
  //     amount,
  //     currency,
  //     status: 'initiated',
  //     payment_data: initResp,
  //   });
  //   await this.paymentRepo.save(payment);

  //   await this.kafka.emit('payment.initiated', { order_id, tx_ref, checkout_url, expires_at });
  //   console.log(checkout_url);
    
  //   this.logger.log(`Payment initiated for order ${order_id}`);
  // }


 public async handleOrderAwaitingPayment(payload: any) {
  const correlation = payload?.order_id ?? 'unknown-order';
  this.logger.log(`handleOrderAwaitingPayment start order_id=${correlation}`);

  const {
    order_id,
    amount,
    currency = 'ETB',
    customer_id,
    restaurant_id,
    return_url,
  } = payload ?? {};

  if (!order_id || !amount || !customer_id || !restaurant_id) {
    this.logger.warn('Invalid order.awaiting_payment payload', { payload });
    await this.kafka.emit('payment.failed', { order_id: order_id ?? null, reason: 'invalid_payload' });
    return;
  }

  // Idempotency: if a payment already exists for this order, handle accordingly
  const existing = await this.paymentRepo.findOne({ where: { order_id } });
  if (existing) {
    this.logger.log(`Existing payment record found for order ${order_id} status=${existing.status}`);
    if (existing.status === 'initiated') {
      const checkout_url =
        existing.payment_data?.data?.checkout_url ??
        existing.payment_data?.checkout_url ??
        existing.payment_data?.data?.checkoutUrl ??
        existing.payment_data?.checkoutUrl ??
        null;
      const expires_at = existing.payment_data?.data?.expires_at ?? null;
      await this.kafka.emit('payment.initiated', { order_id, tx_ref: existing.tx_ref, checkout_url, expires_at });
    } else if (existing.status === 'paid') {
      await this.kafka.emit('payment.success', {
        order_id,
        tx_ref: existing.tx_ref,
        chapa_tx_id: existing.chapa_tx_id,
        amount: existing.amount,
        payment_data: existing.payment_data,
      });
    } else if (existing.status === 'failed') {
      await this.kafka.emit('payment.failed', { order_id, tx_ref: existing.tx_ref, reason: 'previous_attempt_failed' });
    }
    return existing;
  }

  // Verify restaurant has a subaccount
  const restSub = await this.subRepo.findOne({ where: { restaurant_id } });
  if (!restSub) {
    this.logger.warn(`No restaurant subaccount for restaurant_id=${restaurant_id}`);
    await this.kafka.emit('payment.failed', { order_id, reason: 'missing_subaccount' });
    return;
  }

  // Get platform chapa id (DB first, env fallback)
  const platformChapaId = await this.getPlatformChapaId();
  if (!platformChapaId) {
    this.logger.warn(`Platform subaccount not configured (order=${order_id})`);
    await this.kafka.emit('payment.failed', { order_id, reason: 'missing_platform_subaccount' });
    return;
  }

  // const tx_ref = `order-${order_id}-${Date.now()}`;
  const tx_ref = this.makeTxRef(order_id);
  console.log(tx_ref);

  // Build Chapa payload (95% restaurant, 5% platform). Adjust shares if you need dynamic splits.
  const chapaPayload: Record<string, any> = {
    amount,
    currency,
    tx_ref,
    return_url: return_url ?? process.env.CHAPA_RETURN_URL ?? '',
    customer: { id: customer_id },
    subaccounts: [
      { subaccount: restSub.chapa_subaccount_id, share: 0.95 },
      { subaccount: platformChapaId, share: 0.05 },
    ],
    callback_url: '',
  };

  // Call Chapa to initialize transaction
  let initResp: any;
  try {
    this.logger.log(`Initializing Chapa transaction tx_ref=${tx_ref} order_id=${order_id}`);
    initResp = await this.chapa.initializeTransaction(chapaPayload);
    this.logger.debug('Chapa init response (debug)', { tx_ref, respShape: initResp && typeof initResp === 'object' ? Object.keys(initResp).slice(0,5) : null });
  } catch (err: any) {
    this.logger.error(`Chapa initialization failed for order=${order_id}`, err?.response?.data ?? err?.message);
    await this.kafka.emit('payment.failed', { order_id, tx_ref, reason: 'chapa_init_error', error: err?.response?.data ?? err?.message });
    return;
  }

  // Extract checkout url and expires if available (be resilient to shape differences)
  const checkout_url =
    initResp?.data?.checkout_url ??
    initResp?.checkout_url ??
    initResp?.data?.checkoutUrl ??
    initResp?.checkoutUrl ??
    initResp?.data?.data?.checkout_url ??
    null;

  const expires_at = initResp?.data?.expires_at ?? initResp?.expires_at ?? null;
  const chapa_tx_id = initResp?.data?.id ?? initResp?.id ?? null;

  // Persist payment record
  const paymentEntity = this.paymentRepo.create({
    order_id,
    tx_ref,
    chapa_tx_id: chapa_tx_id ?? undefined,
    amount,
    currency,
    status: 'initiated',
    payment_data: initResp,
  } as any);

  try {
    await this.paymentRepo.save(paymentEntity);
  } catch (dbErr: any) {
    this.logger.error(`Failed saving payment for order ${order_id}`, dbErr.message ?? dbErr);
    const maybeExisting = await this.paymentRepo.findOne({ where: { order_id } });
    if (maybeExisting) {
      const checkout = maybeExisting.payment_data?.data?.checkout_url ?? maybeExisting.payment_data?.checkout_url ?? null;
      await this.kafka.emit('payment.initiated', { order_id, tx_ref: maybeExisting.tx_ref, checkout_url: checkout, expires_at: maybeExisting.payment_data?.data?.expires_at ?? null });
      return maybeExisting;
    }
    // otherwise surface failure to orchestrator via failed event
    await this.kafka.emit('payment.failed', { order_id, tx_ref, reason: 'db_save_failed' });
    return;
  }

  // Emit payment.initiated so other services / UIs can redirect user
  try {
    await this.kafka.emit('payment.initiated', { order_id, tx_ref, checkout_url, expires_at });
    console.log(checkout_url);
    this.logger.log(`payment.initiated emitted for order ${order_id} tx_ref=${tx_ref}`);
  } catch (emitErr: any) {
    this.logger.warn('Failed to emit payment.initiated to kafka', emitErr?.message ?? emitErr);
    // do not revert DB — the payment record is authoritative.
  }

  return paymentEntity;
}
  
  async handleChapaWebhook(rawBody: Buffer, signature: string | undefined) {
    const secret = process.env.CHAPA_WEBHOOK_SECRET!;
    const crypto = require('crypto');
    const computed = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    if (!signature || computed !== signature) {
      throw new Error('Invalid webhook signature');
    }
    
    const payload = JSON.parse(rawBody.toString());
    const tx_ref = payload?.data?.tx_ref ?? payload?.data?.reference ?? null;
    if (!tx_ref) throw new Error('tx_ref missing in webhook');
    
    const payment = await this.paymentRepo.findOne({ where: { tx_ref } });
    if (!payment) {
      this.logger.warn(`No payment found for tx_ref ${tx_ref}`);
      return;
    }
    
    if (payment.status === 'paid') {
      this.logger.log(`Webhook for already-paid payment ${tx_ref} ignored`);
      return;
    }
    
    let verifyResp: any;
    try {
      verifyResp = await this.chapa.verifyTransaction(tx_ref);
    } catch (e) {
      this.logger.error('Chapa verify failed', e as any);
      return;
    }
    
    const status = verifyResp?.data?.status ?? verifyResp?.status ?? null;
    if (status === 'success' || status === 'PAID' || status === 'SUCCESS') {
      payment.status = 'paid';
      payment.chapa_tx_id = verifyResp?.data?.id ?? payment.chapa_tx_id;
      payment.payment_data = verifyResp;
      await this.paymentRepo.save(payment);
      
      await this.kafka.emit('payment.success', { order_id: payment.order_id, tx_ref: payment.tx_ref, chapa_tx_id: payment.chapa_tx_id, amount: payment.amount, payment_data: verifyResp });
      return;
    } else {
      payment.status = 'failed';
      payment.payment_data = verifyResp;
      await this.paymentRepo.save(payment);
      
      await this.kafka.emit('payment.failed', { order_id: payment.order_id, tx_ref: payment.tx_ref, reason: 'chapa_status_not_success', payment_data: verifyResp });
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
