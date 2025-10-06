import { Injectable, Logger, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Payment } from '../../entities/payment.entity';
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
    private readonly dataSource: DataSource,
    private readonly chapa: ChapaService,
    // @Inject('PAYMENT_KAFKA') private readonly kafkaClient: ClientKafka,
    private readonly kafka: KafkaProvider,
  ) {}

  // private async emit(topic: string, message: any) {
  //   try {
  //     await this.kafkaClient.emit(topic, message).toPromise();
  //     this.logger.log(`Emitted ${topic}`);
  //   } catch (e) {
  //     this.logger.warn(`Failed to emit ${topic}`, e as any);
  //   }
  // }

  async handleOrderAwaitingPayment(payload: any) {
    const { order_id, amount, currency, customer_id, restaurant_id, return_url } = payload;
    const tx_ref = `order-${order_id}-${Date.now()}`;

    // idempotency: if payment exists for order_id, return existing init
    const existing = await this.paymentRepo.findOne({ where: { order_id } });
    if (existing) {
      this.logger.log(`Payment already exists for order ${order_id}`);
      if (existing.status === 'initiated') {
        const checkout_url = existing.payment_data?.data?.checkout_url ?? existing.payment_data?.checkout_url ?? existing.payment_data?.checkoutUrl ?? null;
        await this.kafka.emit('payment.initiated', { order_id, tx_ref: existing.tx_ref, checkout_url, expires_at: existing.payment_data?.data?.expires_at });
      }
      return;
    }

    // check subaccount
    const sub = await this.subRepo.findOne({ where: { restaurant_id } });
    if (!sub) {
      await this.kafka.emit('payment.failed', { order_id, reason: 'missing_subaccount' });
      return;
    }

    // compose chapa payload with split
    const chapaPayload = {
      amount,
      currency,
      tx_ref,
      return_url: return_url ?? process.env.CHAPA_RETURN_URL ?? '',
      customer: { id: customer_id },
      subaccounts: [
        { subaccount: sub.chapa_subaccount_id, share: 95 },
        { subaccount: process.env.PLATFORM_SUBACCOUNT_ID, share: 5 },
      ],
      callback_url: '',
    };

    // initialize and persist
    let initResp: any;
    try {
      initResp = await this.chapa.initializeTransaction(chapaPayload);
    } catch (e) {
      this.logger.error('Chapa initialize failed', e as any);
      await this.kafka.emit('payment.failed', { order_id, reason: 'chapa_init_error' });
      return;
    }

    const checkout_url = initResp?.data?.checkout_url ?? initResp?.checkout_url ?? initResp?.checkoutUrl ?? null;
    const expires_at = initResp?.data?.expires_at ?? null;

    const payment = this.paymentRepo.create({
      order_id,
      tx_ref,
      chapa_tx_id: initResp?.data?.id ?? undefined,
      amount,
      currency,
      status: 'initiated',
      payment_data: initResp,
    });
    await this.paymentRepo.save(payment);

    await this.kafka.emit('payment.initiated', { order_id, tx_ref, checkout_url, expires_at });
    this.logger.log(`Payment initiated for order ${order_id}`);
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

  // async createSubaccountInternal(payload: any, body: CreateSubaccountDto) {
  //   const { restaurant_id, business_name, account_name, bank_code, account_number, split_value, split_type, return_url } = payload;
  //   const chapaPayload = {
  //     business_name,
  //     account_name,
  //     bank_code: Number(bank_code),
  //     account_number: String(account_number),
  //     split_value: Number(split_value),
  //     split_type,
  //     return_url: return_url ?? process.env.CHAPA_RETURN_URL ?? undefined,
  //   };
  //   const resp = await this.chapa.createSubaccount(chapaPayload);
  //   const chapa_subaccount_id = resp?.data?.id ?? resp?.id ?? null;
  //   if (!chapa_subaccount_id) throw new Error('Chapa subaccount creation failed');
  //   const r = this.subRepo.create({ restaurant_id, chapa_subaccount_id, raw: resp });
  //   return await this.subRepo.save(r);
  // }

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
