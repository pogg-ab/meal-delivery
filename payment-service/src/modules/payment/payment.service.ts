import {
  Injectable,
  Logger,
  Inject,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Payment } from '../../entities/payment.entity';
import { PlatformAccount } from '../../entities/platform-account.entity';
import { RestaurantSubaccount } from '../../entities/restaurant-subaccount.entity';
import { ChapaService } from './chapa.service';
import { ClientKafka } from '@nestjs/microservices';
import { KafkaProvider } from 'src/providers/kafka.provider';
import { CreateSubaccountDto } from './dtos/create-subaccount.dto';
import {
  buildChapaFormPayload,
  ChapaSubaccount,
} from 'src/utils/chapa-form.utils';
// import { PayoutItem } from 'src/entities/payout-item.entity';
import { AggregatedPayout } from 'src/entities/aggregated-payout.entity';
import { PayoutChild } from 'src/entities/payout-children.entity';
import { PayoutBatch } from 'src/entities/payout-batch.entity';
import * as crypto from 'crypto';
import { FindSubaccountsDto } from './dtos/findAll-subaccount.dto';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    // @InjectRepository(PayoutItem) private readonly payoutItemRepo: Repository<PayoutItem>,
    @InjectRepository(PayoutChild)
    private readonly payoutChildRepo: Repository<PayoutChild>,
    // @InjectRepository(PayoutBatch) private readonly payoutBatchRepo: Repository<PayoutBatch>,
    @InjectRepository(RestaurantSubaccount)
    private readonly subRepo: Repository<RestaurantSubaccount>,
    @InjectRepository(PlatformAccount)
    private readonly platformRepo: Repository<PlatformAccount>,
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

  public async handleOrderAwaitingPayment(
    payload: any,
  ): Promise<Payment | null> {
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
        await this.kafka.emit('payment.failed', {
          order_id: order_id ?? null,
          reason: 'invalid_payload',
        });
      } catch (e) {
        this.logger.warn(
          'Failed emitting payment.failed for invalid payload',
          (e as any)?.message ?? e,
        );
      }
      return null;
    }

    // Idempotency: existing payment
    const existing = await this.paymentRepo.findOne({ where: { order_id } });
    if (existing) {
      this.logger.log(
        `Existing payment record found for order ${order_id} status=${existing.status}`,
      );
      try {
        if (existing.status === 'initiated') {
          const checkout_url =
            existing.payment_data?.initResp?.data?.checkout_url ??
            existing.payment_data?.initResp?.checkout_url ??
            existing.payment_data?.checkout_url ??
            existing.payment_data?.initResp?.data?.checkoutUrl ??
            null;
          const expires_at = existing.payment_data?.expires_at ?? null;
          await this.kafka.emit('payment.initiated', {
            order_id,
            tx_ref: existing.tx_ref,
            checkout_url,
            expires_at,
          });
        } else if (existing.status === 'paid') {
          await this.kafka.emit('payment.success', {
            order_id,
            tx_ref: existing.tx_ref,
            chapa_tx_id: existing.chapa_tx_id,
            amount: existing.amount,
            payment_data: existing.payment_data,
          });
        } else {
          await this.kafka.emit('payment.failed', {
            order_id,
            tx_ref: existing.tx_ref,
            reason: 'previous_attempt_failed',
          });
        }
      } catch (e) {
        this.logger.warn(
          'Failed emitting event for existing payment',
          (e as any)?.message ?? e,
        );
      }
      return existing;
    }

    // Ensure restaurant subaccount exists
    const restSub = await this.subRepo.findOne({ where: { restaurant_id } });
    if (!restSub) {
      this.logger.warn(
        `No restaurant subaccount for restaurant_id=${restaurant_id}`,
      );
      try {
        await this.kafka.emit('payment.failed', {
          order_id,
          reason: 'missing_subaccount',
        });
      } catch (e) {
        this.logger.warn(
          'Failed emitting payment.failed for missing_subaccount',
          (e as any)?.message ?? e,
        );
      }
      return null;
    }

    // Ensure platform chapa subaccount exists
    const platformChapaId = await this.getPlatformChapaId();
    if (!platformChapaId) {
      this.logger.warn(
        `Platform subaccount not configured (order=${order_id})`,
      );
      try {
        await this.kafka.emit('payment.failed', {
          order_id,
          reason: 'missing_platform_subaccount',
        });
      } catch (e) {
        this.logger.warn(
          'Failed emitting payment.failed for missing_platform_subaccount',
          (e as any)?.message ?? e,
        );
      }
      return null;
    }

    // Generate tx_ref
    const tx_ref = this.makeTxRef(order_id);
    this.logger.log(`Generated tx_ref=${tx_ref} for order=${order_id}`);

    // Determine desired_splits / platform_topup_needed
    let desired_splits: any =
      payloadDesiredSplits ??
      payload.order?.desired_splits ??
      payload.meta?.desired_splits ??
      null;
    let platform_topup_needed: number | null = payloadPlatformTopup ?? null;

    // Default splits from env
    let restSplitValue = 1 - Number(process.env.PLATFORM_FEE_RATE ?? 0.05);
    let platformSplitValue = Number(process.env.PLATFORM_FEE_RATE ?? 0.05);

    if (
      desired_splits &&
      typeof desired_splits.restaurant_split === 'number' &&
      typeof desired_splits.platform_split === 'number'
    ) {
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
    const subaccounts: Array<{
      id: string;
      split_type: 'percentage' | 'flat';
      split_value: number;
    }> = [
      {
        id: restSub.chapa_subaccount_id,
        split_type: 'percentage',
        split_value: restSplitValue,
      },
      {
        id: platformChapaId,
        split_type: 'percentage',
        split_value: platformSplitValue,
      },
    ];

    // Build meta: include order_id, restaurant_id and platform_topup_needed (so webhook can read directly)
    const meta: any = { order_id, restaurant_id };
    if (
      platform_topup_needed !== null &&
      typeof platform_topup_needed !== 'undefined'
    )
      meta.platform_topup_needed = platform_topup_needed;

    const formPayload = buildChapaFormPayload({
      amount,
      currency,
      tx_ref,
      callback_url: '',
      first_name: customer_name,
      customization: {
        title: 'Order payment',
        description: `Order ${order_id}`,
      },
      meta,
      subaccounts,
    });

    // Initialize with Chapa
    let initResp: any;
    try {
      this.logger.log(
        `Initializing Chapa transaction tx_ref=${tx_ref} order_id=${order_id}`,
      );
      initResp = await this.chapa.initializeTransaction(formPayload);
      this.logger.debug('Chapa init response (keys)', {
        keys:
          initResp && typeof initResp === 'object'
            ? Object.keys(initResp).slice(0, 6)
            : null,
      });
    } catch (err: any) {
      const chapaErr = err?.response?.data ?? err?.message ?? err;
      this.logger.error(
        `Chapa initialization failed for order=${order_id}`,
        chapaErr,
      );

      // --- RECOVERY LOGIC FOR INVALID SUBACCOUNTS ---
      // If the error indicates a subaccount issue (e.g. "Invalid subaccount", "Subaccount not found"),
      // we try to recreate the subaccount for the current environment.
      const errString = JSON.stringify(chapaErr).toLowerCase();
      if (
        errString.includes('subaccount') &&
        (errString.includes('invalid') ||
          errString.includes('found') ||
          errString.includes('exist'))
      ) {
        this.logger.warn(
          `Detected invalid subaccount error for order ${order_id}. Attempting to recreate subaccounts...`,
        );

        try {
          // 1. Recreate Restaurant Subaccount
          if (restSub && restSub.account_number && restSub.bank_code) {
            this.logger.log(
              `Recreating restaurant subaccount for ${restSub.restaurant_id}`,
            );
            const newRestSub = await this.createSubaccountInternal(
              restSub.restaurant_id,
              {
                business_name: restSub.business_name ?? 'Restaurant',
                account_name: restSub.account_name ?? 'Restaurant Account',
                account_number: restSub.account_number,
                bank_code: Number(restSub.bank_code),
                split_type: 'percentage', // default, will be overridden by transaction
                split_value: 0.05, // default
              },
            );
            // Update the ID in our local list
            const idx = subaccounts.findIndex(
              (s) => s.id === restSub.chapa_subaccount_id,
            );
            
            const newId = Array.isArray(newRestSub) ? newRestSub[0].chapa_subaccount_id : newRestSub.chapa_subaccount_id;

            if (idx >= 0 && newId) {
              subaccounts[idx].id = newId;
            }
          }

          // 2. Recreate Platform Subaccount
          // We need to fetch the platform account details first.
          // Since we don't have them in 'platformChapaId' variable (only the ID),
          // we might need to fetch the entity or use default env vars if available.
          // For now, we'll skip platform recreation unless we have data, or we can try to fetch it.
          const platformRec = await this.platformRepo.findOne({ where: {} });
          // If we have raw data or if we can infer it...
          // Actually, platform subaccount creation usually requires specific config.
          // If it's missing/invalid, we might just rely on the restaurant fix first.
          // But if the error persists, we might need manual intervention for platform subaccount.

          // Retry initialization with new subaccounts
          if (formPayload && typeof formPayload === 'object' && 'subaccounts' in formPayload) {
             (formPayload as any).subaccounts = subaccounts;
          }
          
          this.logger.log(
            `Retrying Chapa transaction for order=${order_id} with new subaccounts`,
          );
          initResp = await this.chapa.initializeTransaction(formPayload);
        } catch (retryErr: any) {
          this.logger.error(
            `Retry failed for order=${order_id}`,
            retryErr?.response?.data ?? retryErr?.message,
          );
          // Fall through to failure emission
        }
      }

      if (!initResp) {
        try {
          await this.kafka.emit('payment.failed', {
            order_id,
            tx_ref,
            reason: 'chapa_init_error',
            error: chapaErr,
          });
        } catch (e) {
          this.logger.warn(
            'Failed emitting payment.failed after chapa init failure',
            (e as any)?.message ?? e,
          );
        }
        return null;
      }
    }

    // Extract checkout_url / expires_at / chapa_tx_id
    const checkout_url =
      initResp?.data?.checkout_url ??
      initResp?.checkout_url ??
      initResp?.data?.checkoutUrl ??
      initResp?.checkoutUrl ??
      initResp?.data?.data?.checkout_url ??
      null;
    const expires_at =
      initResp?.data?.expires_at ?? initResp?.expires_at ?? null;
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
        expires_at: expires_at
          ? new Date(expires_at).toISOString()
          : new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        platform_topup_needed: meta.platform_topup_needed ?? null,
        restaurant_id,
      },
    } as any) as unknown as Payment;

    let savedPayment: Payment;
    try {
      savedPayment = await this.paymentRepo.save(paymentEntity);
    } catch (dbErr: any) {
      this.logger.error(
        `Failed saving payment for order ${order_id}`,
        dbErr?.message ?? dbErr,
      );

      // concurrent save might have created a record — re-fetch single entity
      const maybeExisting = await this.paymentRepo.findOne({
        where: { order_id },
      });
      if (maybeExisting) {
        const cku =
          maybeExisting.payment_data?.initResp?.data?.checkout_url ??
          maybeExisting.payment_data?.initResp?.checkout_url ??
          maybeExisting.payment_data?.checkout_url ??
          null;
        try {
          await this.kafka.emit('payment.initiated', {
            order_id,
            tx_ref: maybeExisting.tx_ref,
            checkout_url: cku,
            expires_at: maybeExisting.payment_data?.expires_at ?? null,
          });
        } catch (e) {
          this.logger.warn(
            'Failed emitting payment.initiated after concurrent DB save',
            (e as any)?.message ?? e,
          );
        }
        return maybeExisting;
      }

      try {
        await this.kafka.emit('payment.failed', {
          order_id,
          tx_ref,
          reason: 'db_save_failed',
        });
      } catch (e) {
        this.logger.warn(
          'Failed emitting payment.failed after db_save_failed',
          (e as any)?.message ?? e,
        );
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
      this.logger.log(
        `payment.initiated emitted for order ${order_id} tx_ref=${tx_ref}`,
      );
    } catch (emitErr: any) {
      this.logger.warn(
        'Failed to emit payment.initiated to kafka',
        emitErr?.message ?? emitErr,
      );
    }

    return savedPayment;
  }

  //Handle webhook
  async handleChapaWebhook(
    rawBody: Buffer | undefined,
    signatureHeader?: string,
  ): Promise<void> {
    const logger =
      this.logger ?? new (require('@nestjs/common').Logger)('PaymentsService');
    const { BadRequestException } = require('@nestjs/common');
    const crypto = require('crypto');

    // 1) signature verification (HMAC SHA256)
    const secret = process.env.CHAPA_WEBHOOK_SECRET;
    // const secret = process.env.PROD_CHAPA_SECRET;
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

    const computed = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest();
    let sigBuf: Buffer | null = null;
    if (/^[0-9a-f]{64}$/i.test(sigToken)) sigBuf = Buffer.from(sigToken, 'hex');
    else {
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
    if (
      sigBuf.length !== computed.length ||
      !crypto.timingSafeEqual(computed, sigBuf)
    ) {
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
    const tx_ref =
      payload?.tx_ref ??
      payload?.data?.tx_ref ??
      payload?.data?.reference ??
      null;
    const isPaymentEvent =
      Boolean(tx_ref) ||
      (typeof payload?.event === 'string' &&
        payload.event.toLowerCase().includes('charge'));
    const hasTransferResults =
      Array.isArray(payload?.results) ||
      Boolean(payload?.data?.id) ||
      Boolean(payload?.transfer) ||
      Boolean(payload?.transfer_id);

    // ---------- PAYMENT FLOW ----------
    if (isPaymentEvent) {
      try {
        const txRef = tx_ref;
        if (!txRef) {
          logger.warn('Payment webhook missing tx_ref; ignoring payment path');
          return;
        }

        // find payment record
        const payment = await this.paymentRepo.findOne({
          where: { tx_ref: txRef },
        });
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

        const statusRaw =
          verifyResp?.data?.status ??
          verifyResp?.status ??
          payload?.status ??
          '';
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
              logger.warn(
                `Cannot create payout child for order ${payment.order_id}: restaurant_id missing in payment meta`,
              );
            } else {
              // Idempotency: ensure we don't create duplicate child for the same order+reason
              const existing = await this.payoutChildRepo.findOne({
                where: {
                  order_id: payment.order_id,
                  reason: 'promo_platform_topup',
                },
              });
              if (existing) {
                logger.log(
                  `Payout child already exists for order ${payment.order_id} (id=${existing.id}), skipping creation`,
                );
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
                const savedChild = Array.isArray(savedRaw)
                  ? (savedRaw as any)[0]
                  : (savedRaw as any);
                logger.log(
                  `Created payout_child ${savedChild.id} for order ${payment.order_id} amount=${savedChild.amount}`,
                );
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
      else if (Array.isArray(payload?.data?.results))
        results.push(...payload.data.results);
      else if (payload?.data && payload.data.id) results.push(payload.data);
      else if (payload?.transfer) results.push(payload.transfer);
      else if (payload?.id || payload?.transfer_id) results.push(payload);

      if (results.length === 0) {
        logger.warn('Bulk webhook contained no transfer results; ignoring');
        return;
      }

      for (const r of results) {
        const providerTransferId = r.transfer_id ?? r.id ?? r.tx_id ?? null;
        const reference =
          r.reference ??
          r.metadata?.payout_item_id ??
          r.metadata?.reference ??
          null;
        const statusRaw = (r.status ?? r.state ?? r.result ?? '')
          .toString()
          .toLowerCase();
        const isSuccess = ['success', 'paid', 'completed'].includes(statusRaw);
        const isFailed = ['failed', 'error', 'rejected', 'cancelled'].includes(
          statusRaw,
        );
        const fee = r.fee ? Number(r.fee) : null;
        const error = r.error ?? r.failure_reason ?? null;
        const providerBatchId =
          payload.provider_batch_id ??
          payload.data?.provider_batch_id ??
          payload.batch_id ??
          null;

        try {
          await this.dataSource.transaction(async (manager) => {
            const aggRepo = manager.getRepository(AggregatedPayout);
            const childRepo = manager.getRepository(PayoutChild);
            const batchRepo = manager.getRepository(PayoutBatch);

            // locate aggregated payout (prefer provider_transfer_id, then reference/payout_item_id)
            let agg: any = null;
            if (providerTransferId) {
              agg = await aggRepo.findOne({
                where: { provider_transfer_id: providerTransferId },
              });
            }
            if (!agg && reference) {
              agg = await aggRepo
                .findOne({ where: { id: reference } })
                .catch(() => null);
            }
            if (!agg && r.metadata?.payout_item_id) {
              agg = await aggRepo
                .findOne({ where: { id: r.metadata.payout_item_id } })
                .catch(() => null);
            }

            if (!agg) {
              logger.warn(
                `No aggregated_payout found for transfer providerTransferId=${providerTransferId} reference=${reference}`,
              );
              return;
            }

            // idempotency: if already in final state and matches, skip
            if (agg.status === 'paid' && isSuccess) {
              logger.log(`Aggregated payout ${agg.id} already paid; skipping`);
              return;
            }

            // prepare update
            const updateObj: any = {
              provider_response: r,
              provider_transfer_id:
                providerTransferId ?? agg.provider_transfer_id ?? null,
            };
            if (isSuccess) {
              updateObj.status = 'paid';
              updateObj.last_error = null;
            } else if (isFailed) {
              updateObj.status = 'failed';
              updateObj.last_error = String(error ?? 'provider_failed');
            } else {
              updateObj.status = 'processing';
            }

            await aggRepo.update({ id: agg.id }, updateObj);

            // refresh agg to read meta.child_ids
            const freshAgg = await aggRepo.findOne({ where: { id: agg.id } });
            if (!freshAgg) {
              logger.warn(
                `Aggregated payout ${agg.id} disappeared after update; skipping children update`,
              );
              return;
            }

            const childIds: string[] = Array.isArray(freshAgg.meta?.child_ids)
              ? freshAgg.meta.child_ids
              : [];

            if (childIds && childIds.length) {
              if (isSuccess) {
                await childRepo
                  .createQueryBuilder()
                  .update()
                  .set({
                    status: 'paid',
                    meta: () =>
                      `jsonb_set(coalesce(meta,'{}'::jsonb), '{paid_via}', to_jsonb('${providerTransferId ?? ''}'))`,
                  })
                  .where('id = ANY(:ids)', { ids: childIds })
                  .execute();
              } else if (isFailed) {
                await childRepo
                  .createQueryBuilder()
                  .update()
                  .set({
                    status: 'failed',
                    meta: () =>
                      `jsonb_set(coalesce(meta,'{}'::jsonb), '{last_error}', to_jsonb('${String(error ?? 'provider_failed')}'))`,
                  })
                  .where('id = ANY(:ids)', { ids: childIds })
                  .execute();
              } else {
                // processing -> leave child status as-is (batched)
              }
            }

            // update parent batch summary if present
            if (freshAgg.payout_batch_id) {
              const batch = await batchRepo.findOne({
                where: { id: freshAgg.payout_batch_id },
              });
              if (batch) {
                const aggRows = await aggRepo.find({
                  where: { payout_batch_id: batch.id },
                });
                const allPaid = aggRows.every((aa) => aa.status === 'paid');
                const anyFailed = aggRows.some((aa) => aa.status === 'failed');
                batch.status = allPaid
                  ? 'completed'
                  : anyFailed
                    ? 'failed'
                    : 'processing';
                batch.total_amount = aggRows.reduce(
                  (s, it) => s + Number(it.amount ?? 0),
                  0,
                );
                batch.processed_at =
                  allPaid || anyFailed ? new Date() : batch.processed_at;
                batch.meta = {
                  ...(batch.meta ?? {}),
                  last_provider_callback: new Date().toISOString(),
                  provider_batch_id: providerBatchId ?? batch.provider_batch_id,
                };
                await batchRepo.save(batch);

                try {
                  await this.kafka.emit('payout.batch.updated', {
                    batch_id: batch.id,
                    status: batch.status,
                    provider_batch_id: batch.provider_batch_id,
                  });
                } catch (e) {
                  logger.warn(
                    'Failed emit payout.batch.updated',
                    e?.message ?? e,
                  );
                }
              }
            }

            // emit per-agg event
            try {
              if (isSuccess)
                await this.kafka.emit('payout.item.paid', {
                  payout_item_id: freshAgg.id,
                  restaurant_id: freshAgg.restaurant_id,
                  amount: freshAgg.amount,
                  provider_transfer_id: providerTransferId,
                  fee,
                });
              else if (isFailed)
                await this.kafka.emit('payout.item.failed', {
                  payout_item_id: freshAgg.id,
                  restaurant_id: freshAgg.restaurant_id,
                  amount: freshAgg.amount,
                  error,
                });
              else
                await this.kafka.emit('payout.item.updated', {
                  payout_item_id: freshAgg.id,
                  status: updateObj.status,
                });
            } catch (e) {
              logger.warn('Failed to emit payout.item event', e?.message ?? e);
            }
          }); // end transaction for this result
        } catch (txErr) {
          logger.error(
            'Failed to process transfer result in transaction',
            txErr?.message ?? txErr,
            { result: r },
          );
          // swallow and continue so webhook can be acked; provider may retry
          continue;
        }
      } // end for results

      return;
    }

    // neither path matched
    logger.warn(
      'Webhook payload did not match payment or transfer shapes; ignoring',
    );
    return;
  }

  // --- create/update platform account (internal) ---
  async createOrUpdatePlatformAccount(dto: CreateSubaccountDto) {
    // call Chapa
    const resp = await this.chapa.createSubaccount(dto);
    const chapa_subaccount_id = resp?.data?.subaccount_id;
    if (!chapa_subaccount_id)
      throw new Error(
        'Chapa returned unexpected response while creating platform subaccount',
      );

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
  async createSubaccountInternal(
    restaurant_id: string,
    payload: CreateSubaccountDto,
  ) {
    const logger =
      this.logger ?? new (require('@nestjs/common').Logger)('PaymentsService');
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
      throw new Error(
        'account_name, account_number and bank_code are required to onboard a restaurant subaccount',
      );
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
      logger.debug('chapa resp keys', {
        keys:
          resp && typeof resp === 'object'
            ? Object.keys(resp).slice(0, 8)
            : null,
      });
    } catch (err: any) {
      const errMsg =
        err?.response?.data?.message ?? err?.message ?? JSON.stringify(err);
      logger.warn(
        `Chapa createSubaccount failed: ${errMsg}. Attempting recovery...`,
      );

      // If subaccount exists, try to find it by account number
      if (
        String(errMsg).toLowerCase().includes('exist') ||
        String(errMsg).toLowerCase().includes('duplicate')
      ) {
        try {
          const listResp = await this.chapa.getSubaccounts();
          const allSubs = listResp?.data ?? listResp?.subaccounts ?? [];
          if (Array.isArray(allSubs)) {
            const match = allSubs.find(
              (s: any) =>
                String(s.account_number) === String(account_number) &&
                String(s.bank_code) === String(bank_code),
            );
            if (match) {
              logger.log(
                `Found existing subaccount for restaurant=${restaurant_id} (id=${match.id})`,
              );
              resp = {
                status: 'success',
                message: 'Recovered existing subaccount',
                data: match,
              };
            }
          }
        } catch (findErr) {
          logger.error(
            'Failed to list subaccounts for recovery',
            findErr?.message,
          );
        }
      }

      if (!resp) {
        logger.error(
          'Chapa createSubaccount failed and recovery failed',
          err?.response?.data ?? err?.message ?? err,
        );
        throw new Error('Chapa subaccount creation failed');
      }
    }

    const chapa_subaccount_id = resp?.data?.subaccount_id ?? resp?.id ?? null;
    if (!chapa_subaccount_id) {
      logger.error(
        'Chapa returned unexpected response while creating subaccount',
        resp,
      );
      throw new Error('Chapa subaccount creation failed (no id returned)');
    }

    // Upsert local DB record for restaurant subaccount, including bank details
    try {
      const existing = await this.subRepo.findOne({ where: { restaurant_id } });
      if (existing) {
        existing.chapa_subaccount_id = chapa_subaccount_id;
        existing.business_name = business_name ?? existing.business_name;
        existing.account_name = account_name ?? existing.account_name;
        existing.account_number = String(
          account_number ?? existing.account_number,
        );
        existing.bank_code = String(bank_code ?? existing.bank_code);
        existing.raw = resp;
        const updated = await this.subRepo.save(existing);
        logger.log(
          `Updated restaurant_subaccounts for restaurant ${restaurant_id} (id=${updated.id})`,
        );
        return updated;
      } else {
        const rec = this.subRepo.create({
          restaurant_id,
          chapa_subaccount_id,
          business_name,
          account_name,
          account_number: String(account_number),
          bank_code,
          raw: resp,
        } as any);
        const saved = await this.subRepo.save(rec);
        logger.log(
          `Created restaurant_subaccounts for restaurant ${restaurant_id}`,
        );
        return saved;
      }
    } catch (dbErr: any) {
      logger.error(
        'Failed saving restaurant_subaccounts record',
        dbErr?.message ?? dbErr,
      );
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

  async findAll(query: FindSubaccountsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 25;

    const qb = this.subRepo
      .createQueryBuilder('sub')
      .select([
        'sub.id',
        'sub.restaurant_id',
        'sub.chapa_subaccount_id',
        'sub.business_name',
        'sub.account_name',
        'sub.account_number',
        'sub.bank_code',
        'sub.onboarded_at',
      ]);

    if (query.restaurant_id) {
      qb.andWhere('sub.restaurant_id = :rid', { rid: query.restaurant_id });
    }

    qb.orderBy('sub.onboarded_at', 'DESC');

    const [items, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  //Create Aggregate payout
  // createAggregatedBatch - robust implementation (copy-paste)
  // Assumes imports: PayoutChild, AggregatedPayout (or PayoutItem aggregate entity), PayoutBatch, RestaurantSubaccount
  // and this.dataSource is available in the class (TypeORM DataSource) and this.logger exists.

  async createAggregatedBatch(opts: {
    olderThan?: string | Date | null;
    restaurantIds?: string[] | null;
    minTotal?: number | null;
    createdBy: string;
    autoProcess?: boolean | null;
  }): Promise<{ batch: PayoutBatch; details: any }> {
    const createdBy = opts.createdBy ?? 'system';
    const minTotal =
      typeof opts.minTotal === 'number' ? Number(opts.minTotal) : null;

    return await this.dataSource.transaction(async (manager) => {
      const childRepo = manager.getRepository(PayoutChild); // child-level shortfalls
      const aggRepo = manager.getRepository(AggregatedPayout); // aggregated per-restaurant
      const batchRepo = manager.getRepository(PayoutBatch);
      const subRepo = manager.getRepository(RestaurantSubaccount);

      // 1) create batch
      const batchEntity = batchRepo.create({
        status: 'created',
        total_amount: 0,
        meta: {
          created_by: createdBy,
          created_at: new Date().toISOString(),
          autoProcess: !!opts.autoProcess,
        },
      } as any);
      const savedBatchRes = await batchRepo.save(batchEntity);
      const savedBatch: PayoutBatch = Array.isArray(savedBatchRes)
        ? savedBatchRes[0]
        : savedBatchRes;

      // prepare response diagnostics
      const details: any = {
        candidate_rows: [],
        created_aggregates: [],
        skipped: [],
        total_restaurants_considered: 0,
        total_aggregated_restaurants: 0,
        total_amount: 0,
      };

      // 2) build grouping query for pending children
      // Normalize olderThan to Date if provided as string
      let olderThanDate: Date | null = null;
      if (opts.olderThan) {
        olderThanDate =
          opts.olderThan instanceof Date
            ? opts.olderThan
            : new Date(String(opts.olderThan));
        if (isNaN(olderThanDate.getTime())) olderThanDate = null;
      }

      const qb = childRepo
        .createQueryBuilder('c')
        .select('c.restaurant_id', 'restaurant_id')
        .addSelect('ARRAY_AGG(c.id)', 'child_ids')
        .addSelect('SUM(c.amount)', 'total_amount')
        .where("c.status = 'pending' AND c.reason = 'promo_platform_topup'");

      if (olderThanDate) {
        qb.andWhere('c.created_at <= :olderThan', {
          olderThan: olderThanDate.toISOString(),
        });
      }
      if (
        opts.restaurantIds &&
        Array.isArray(opts.restaurantIds) &&
        opts.restaurantIds.length > 0
      ) {
        qb.andWhere('c.restaurant_id IN (:...rids)', {
          rids: opts.restaurantIds,
        });
      }

      qb.groupBy('c.restaurant_id');

      const rawRows: any[] = await qb.getRawMany();
      details.candidate_rows_raw = rawRows;

      // Normalize raw rows (child_ids might be '{id,id}' string or array, total_amount might be string)
      const rows = rawRows.map((r) => {
        // normalize child_ids
        let child_ids: string[] = [];
        if (Array.isArray(r.child_ids)) {
          child_ids = r.child_ids;
        } else if (typeof r.child_ids === 'string') {
          const trimmed = r.child_ids.replace(/^{|}$/g, '').trim();
          child_ids = trimmed.length
            ? trimmed.split(',').map((s: string) => s.trim())
            : [];
        } else if (r.child_ids && typeof r.child_ids === 'object') {
          // some drivers return typed arrays
          child_ids = Array.from(r.child_ids);
        } else {
          child_ids = [];
        }

        const total_amount = Number(r.total_amount ?? 0);
        return {
          restaurant_id: String(r.restaurant_id),
          child_ids,
          total_amount,
        };
      });

      details.total_restaurants_considered = rows.length;

      let totalForBatch = 0;

      for (const r of rows) {
        const t = Number(r.total_amount ?? 0);

        // skip by minTotal if set
        if (minTotal !== null && t < minTotal) {
          details.skipped.push({
            restaurant_id: r.restaurant_id,
            reason: 'below_min_total',
            total: t,
          });
          continue;
        }

        // fetch restaurant subaccount (bank details)
        const sub = await subRepo.findOne({
          where: { restaurant_id: r.restaurant_id },
        });
        if (!sub) {
          details.skipped.push({
            restaurant_id: r.restaurant_id,
            reason: 'missing_subaccount',
            total: t,
          });
          continue;
        }
        if (!sub.account_number || !sub.account_name || !sub.bank_code) {
          details.skipped.push({
            restaurant_id: r.restaurant_id,
            reason: 'missing_bank_details',
            missing: {
              account_number: !!sub.account_number,
              account_name: !!sub.account_name,
              bank_code: !!sub.bank_code,
            },
            total: t,
          });
          continue;
        }

        // create aggregated payout record
        const aggEntity = aggRepo.create({
          payout_batch_id: savedBatch.id,
          restaurant_id: r.restaurant_id,
          amount: t,
          status: 'batched',
          reason: 'promo_platform_topup_aggregated',
          account_number: sub.account_number,
          account_name: sub.account_name,
          bank_code: sub.bank_code,
          meta: {
            child_ids: r.child_ids,
            created_by: createdBy,
            created_at: new Date().toISOString(),
          },
        } as any);

        const savedAggRes = await aggRepo.save(aggEntity);
        const savedAgg = Array.isArray(savedAggRes)
          ? savedAggRes[0]
          : savedAggRes;

        // Link children to aggregate in a single update query
        if (r.child_ids && r.child_ids.length) {
          await childRepo
            .createQueryBuilder()
            .update()
            .set({ status: 'batched', parent_aggregate_id: savedAgg.id })
            .where('id = ANY(:ids)', { ids: r.child_ids })
            .execute();
        }

        totalForBatch += t;
        details.created_aggregates.push({
          aggregate_id: savedAgg.id,
          restaurant_id: r.restaurant_id,
          total: t,
          child_count: r.child_ids.length,
        });
      }

      // finalize batch totals and save
      savedBatch.total_amount = Number(
        Math.round((totalForBatch + Number.EPSILON) * 100) / 100,
      );
      const finalBatchRes = await batchRepo.save(savedBatch);
      const finalBatch: PayoutBatch = Array.isArray(finalBatchRes)
        ? finalBatchRes[0]
        : finalBatchRes;

      details.total_aggregated_restaurants = details.created_aggregates.length;
      details.total_amount = Number(finalBatch.total_amount ?? 0);

      // return enriched batch + diagnostics
      return { batch: finalBatch, details };
    });
  }

  //Process Aggregate payment
  async processAggregatedBatch(
    batchId: string,
    p0: { requestedBy: any; force: boolean },
  ) {
    const logger = this.logger;
    const requestedBy = p0?.requestedBy ?? 'system';
    const force = !!p0?.force;

    const batchRepo = this.dataSource.getRepository(PayoutBatch);
    const aggRepo = this.dataSource.getRepository(AggregatedPayout);
    const childRepo = this.dataSource.getRepository(PayoutChild);

    // --- 0) atomic claim using RETURNING to avoid race conditions ---
    const maxStaleMinutes = Number(
      process.env.PAYOUT_PROCESSING_STALE_MINUTES ?? 15,
    );
    const staleCutoff = new Date(
      Date.now() - maxStaleMinutes * 60_000,
    ).toISOString();

    const qb = batchRepo
      .createQueryBuilder()
      .update()
      .set({ status: 'processing', attempt_count: () => 'attempt_count + 1' })
      .where(
        `id = :id AND (
         status != :processing
         OR :force = true
         OR (status = :processing AND updated_at < :staleCutoff)
       )`,
        { id: batchId, processing: 'processing', force, staleCutoff },
      )
      .returning('*');

    const updateRes = await qb.execute();
    const claimedRow =
      (updateRes && (updateRes as any).raw && (updateRes as any).raw[0]) ??
      null;

    if (!claimedRow) {
      // Nothing returned -> either doesn't exist or is actively processing & not reclaimable
      const existing = await batchRepo.findOne({ where: { id: batchId } });
      if (!existing) throw new Error('Batch not found');

      if (existing.status === 'processing') {
        // Check aggregated payouts state: if there are no active 'processing' or 'batched' items,
        // that means prior worker(s) left terminal results (paid/failed) but didn't finalize batch.
        // In that case finalize the batch now instead of returning a no-op.
        const summary = await aggRepo
          .createQueryBuilder('a')
          .select(
            "COUNT(*) FILTER (WHERE a.status = 'processing')",
            'processing_count',
          )
          .addSelect(
            "COUNT(*) FILTER (WHERE a.status = 'batched')",
            'batched_count',
          )
          .addSelect(
            "COUNT(*) FILTER (WHERE a.status = 'failed')",
            'failed_count',
          )
          .addSelect("COUNT(*) FILTER (WHERE a.status = 'paid')", 'paid_count')
          .where('a.payout_batch_id = :id', { id: batchId })
          .getRawOne();

        const processingCount = Number(summary?.processing_count ?? 0);
        const batchedCount = Number(summary?.batched_count ?? 0);
        const failedCount = Number(summary?.failed_count ?? 0);
        const paidCount = Number(summary?.paid_count ?? 0);

        // If there are no active items left (no 'processing' and no 'batched'), finalize batch
        if (processingCount === 0 && batchedCount === 0) {
          const sumRow = await aggRepo
            .createQueryBuilder('a')
            .select('COALESCE(SUM(a.amount),0)', 'sum')
            .where('a.payout_batch_id = :id', { id: batchId })
            .getRawOne();

          const totalAmount = Number(sumRow?.sum ?? 0);

          existing.total_amount = totalAmount;
          existing.processed_at = new Date();
          existing.status = failedCount > 0 ? 'failed' : 'completed';
          existing.meta = {
            ...(existing.meta ?? {}),
            finalized_by: requestedBy,
            finalized_at: new Date().toISOString(),
          };

          await batchRepo.save(existing);
          logger.log(
            `Batch ${batchId} had no active aggregates — finalized as ${existing.status} (paid=${paidCount} failed=${failedCount})`,
          );
          return existing;
        }

        // Otherwise it's actively processing by someone else - no-op
        logger.warn(
          `Batch ${batchId} is already processing by another worker — exiting job (no-op).`,
        );
        return existing;
      }

      // not processing and we couldn't claim for other reasons - throw
      throw new Error('Batch could not be claimed for processing');
    }

    // Fetch fresh entity (now that we've claimed)
    const batch = await batchRepo.findOne({ where: { id: batchId } });
    if (!batch) throw new Error('Batch not found after claim (unexpected)');

    // --- 1) load aggregated payouts for processing ---
    const aggs = await aggRepo.find({
      where: { payout_batch_id: batchId, status: 'batched' },
    });
    if (!aggs || aggs.length === 0) {
      logger.warn(`No aggregated payouts to process for batch ${batchId}`);
      batch.status = 'completed';
      batch.processed_at = new Date();
      await batchRepo.save(batch);
      return batch;
    }

    // mark aggs processing (bump attempt_count)
    const aggIds = aggs.map((a) => a.id);
    if (aggIds.length > 0) {
      await aggRepo
        .createQueryBuilder()
        .update()
        .set({ status: 'processing', attempt_count: () => 'attempt_count + 1' })
        .where('id IN (:...ids)', { ids: aggIds })
        .execute();
    }

    // build transfers for provider
    const transfers = aggs.map((a) => ({
      payout_item_id: a.id,
      account_name: a.account_name ?? '',
      account_number: a.account_number ?? '',
      bank_code: a.bank_code ?? '',
      amount: Number(a.amount ?? 0),
      currency: batch?.meta?.currency ?? 'ETB',
      reference: a.id, // use aggregate id as reference for idempotency
      metadata: { payout_item_id: a.id, child_ids: a.meta?.child_ids ?? [] },
    }));

    // --- 2) call provider bulk transfer ---
    let providerResp: any;
    try {
      providerResp = await this.chapa.bulkTransfer({
        transfers,
        title: `Payout Batch ${batchId}`,
        currency: 'ETB',
        reference: batchId,
      });
    } catch (err) {
      logger.error('Chapa bulk transfer failed', err?.message ?? err);

      // mark aggs failed
      if (aggIds.length > 0) {
        await aggRepo
          .createQueryBuilder()
          .update()
          .set({ status: 'failed', last_error: String(err?.message ?? err) })
          .where('id IN (:...ids)', { ids: aggIds })
          .execute();
      }

      batch.status = 'failed';
      batch.meta = {
        ...(batch.meta ?? {}),
        provider_error: err?.message ?? String(err),
      };
      batch.processed_at = new Date();
      await batchRepo.save(batch);
      return batch;
    }

    // persist provider response on batch
    batch.provider_batch_id = providerResp?.provider_batch_id ?? null;
    batch.meta = {
      ...(batch.meta ?? {}),
      provider_response: providerResp?.raw ?? providerResp,
    };

    const results: any[] = providerResp?.results ?? [];
    const resultMap = new Map<string, any>();
    for (const r of results) {
      const key = String(r?.payout_item_id ?? r?.reference ?? r?.id ?? '');
      if (key) resultMap.set(key, r);
    }

    // --- 3) reconcile aggs and children according to provider results ---
    for (const a of aggs) {
      const res = resultMap.get(a.id);

      if (!res) {
        // No immediate per-transfer result -> leave as 'processing' for webhook finalization
        await aggRepo.update({ id: a.id }, {
          provider_response: (a.provider_response ?? null) || { queued: true },
        } as any);
        continue;
      }

      const normalizedStatus = (res.status ?? '').toString().toLowerCase();

      if (['success', 'paid', 'completed', 'ok'].includes(normalizedStatus)) {
        await aggRepo.update({ id: a.id }, {
          status: 'paid',
          provider_transfer_id: res.transfer_id ?? res.id ?? null,
          provider_response: res.raw ?? res,
        } as any);

        const childIds: string[] = a.meta?.child_ids ?? [];
        if (childIds && childIds.length) {
          await childRepo
            .createQueryBuilder()
            .update()
            .set({
              status: 'paid',
              meta: () =>
                `jsonb_set(coalesce(meta,'{}'::jsonb), '{paid_via}', to_jsonb('${String(res.transfer_id ?? res.id ?? '')}'))`,
            })
            .where('id IN (:...ids)', { ids: childIds })
            .execute();
        }

        try {
          await this.kafka.emit('payout.item.paid', {
            payout_item_id: a.id,
            restaurant_id: a.restaurant_id,
            amount: a.amount,
            provider_transfer_id: res.transfer_id ?? res.id ?? null,
          });
        } catch (e) {
          logger.warn('Failed to emit payout.item.paid', e?.message ?? e);
        }
      } else {
        const lastErr =
          res.error ??
          res.raw?.error_message ??
          res.raw?.message ??
          'provider_failed';
        await aggRepo.update({ id: a.id }, {
          status: 'failed',
          last_error: lastErr,
          provider_response: res.raw ?? res,
        } as any);

        const childIds: string[] = a.meta?.child_ids ?? [];
        if (childIds && childIds.length) {
          await childRepo
            .createQueryBuilder()
            .update()
            .set({
              status: 'failed',
              meta: () =>
                `jsonb_set(coalesce(meta,'{}'::jsonb), '{last_error}', to_jsonb('${String(lastErr).replace(/'/g, "''")}'))`,
            })
            .where('id IN (:...ids)', { ids: childIds })
            .execute();
        }

        try {
          await this.kafka.emit('payout.item.failed', {
            payout_item_id: a.id,
            restaurant_id: a.restaurant_id,
            amount: a.amount,
            error: lastErr,
          });
        } catch (e) {
          logger.warn('Failed to emit payout.item.failed', e?.message ?? e);
        }
      }
    }

    // --- 4) finalize batch status ---
    const updatedAggs = await aggRepo.find({
      where: { payout_batch_id: batchId },
    });
    const total = updatedAggs.reduce((s, it) => s + Number(it.amount ?? 0), 0);
    const allPaid = updatedAggs.every((it) => it.status === 'paid');
    const anyFailed = updatedAggs.some((it) => it.status === 'failed');

    batch.total_amount = total;
    batch.processed_at = new Date();
    batch.status = allPaid ? 'completed' : anyFailed ? 'failed' : 'processing';

    await batchRepo.save(batch);

    try {
      await this.kafka.emit('payout.batch.processed', {
        batch_id: batch.id,
        provider_batch_id: batch.provider_batch_id,
        total_amount: batch.total_amount,
        status: batch.status,
      });
    } catch (e) {
      logger.warn('Failed to emit payout.batch.processed', e?.message ?? e);
    }

    return batch;
  }
}
