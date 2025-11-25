import { Injectable, Logger } from '@nestjs/common';
// import axios, { type AxiosInstance } from 'axios';
import axios from 'axios';
import type { AxiosInstance } from 'axios';

@Injectable()
export class ChapaService {
  private readonly logger = new Logger(ChapaService.name);
  private client: AxiosInstance;
  private secret: string;

  constructor() {
    this.secret = process.env.CHAPA_SECRET || process.env.PROD_CHAPA_SECRET!;
    this.client = axios.create({
      baseURL: process.env.CHAPA_BASE_URL || 'https://api.chapa.co',
      timeout: 10000,
    });
  }

  private headers() {
    return {
      Authorization: `Bearer ${this.secret}`,
      'Content-Type': 'application/json',
    };
  }

  async initializeTransaction(payload: any) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        let headers: Record<string, string> = {
          ...this.headers(),
          Accept: 'application/json',
        };
        let body: any = payload;

        if (payload instanceof URLSearchParams) {
          headers['Content-Type'] = 'application/x-www-form-urlencoded';
          body = payload.toString(); // URL-encoded string
        } else {
          headers['Content-Type'] = 'application/json';
          body = payload;
        }

        const res = await this.client.post('/v1/transaction/initialize', body, {
          headers,
        });
        return res.data;
      } catch (err: any) {
        this.logger.warn('Chapa init attempt failed', {
          attempt,
          err: err?.response?.data ?? err?.message,
        });
        if (attempt === 2) throw err;
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      }
    }
  }

  async verifyTransaction(tx_ref: string) {
    const res = await this.client.get(
      `/v1/transaction/verify/${encodeURIComponent(tx_ref)}`,
      { headers: this.headers() },
    );
    return res.data;
  }

  async createSubaccount(payload: any) {
    const res = await this.client.post('/v1/subaccount', payload, {
      headers: this.headers(),
    });
    return res.data;
  }

  async getSubaccounts() {
    const res = await this.client.get('/v1/subaccount', {
      headers: this.headers(),
    });
    return res.data;
  }

  async refundTransaction(payload: any) {
    const res = await this.client.post('/v1/transaction/refund', payload, {
      headers: this.headers(),
    });
    return res.data;
  }

  // add inside your existing ChapaService class (keep your existing methods)
  async bulkTransfer(opts: {
    transfers: Array<{
      payout_item_id: string;
      account_name: string;
      account_number: string;
      bank_code: string | number;
      amount: number;
      currency?: string;
      metadata?: any;
    }>;
    title?: string;
    currency?: string;
    reference?: string; // usually batch id
  }) {
    const logger = this.logger;
    const { transfers, title, currency = 'ETB', reference } = opts;

    // build bulk_data payload expected by Chapa
    const bulk_data = transfers.map((t) => ({
      account_name: t.account_name,
      account_number: String(t.account_number),
      amount: Number(t.amount),
      reference: String(t.payout_item_id), // use payout_item_id as reference so we can map back
      bank_code: Number(t.bank_code),
    }));

    const payload = {
      title: title ?? `Payout Batch ${reference ?? ''}`.trim(),
      currency,
      bulk_data,
    };

    // attempt with small retry/backoff
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const headers = { ...this.headers(), Accept: 'application/json' };
        const res = await this.client.post('/v1/bulk-transfers', payload, {
          headers,
        });
        const data = res?.data ?? null;

        // Defensive normalization: different providers may nest differently.
        const provider_batch_id =
          data?.data?.id ??
          data?.data?.bulk_transfer_id ??
          data?.id ??
          data?.bulk_transfer_id ??
          data?.reference ??
          null;

        // try to find per-item array in common shapes
        const rawItems =
          data?.data?.bulk_data ??
          data?.data?.items ??
          data?.data?.transfers ??
          data?.items ??
          data?.bulk_data ??
          data?.transfers ??
          null;

        const results: Array<any> = [];

        if (Array.isArray(rawItems)) {
          // Items often include a 'reference' field which we set to payout_item_id
          for (const it of rawItems) {
            const referenceField =
              it?.reference ?? it?.ref ?? it?.payout_reference ?? null;
            const payout_item_id = referenceField
              ? String(referenceField)
              : null;

            const transfer_id =
              it?.transfer_id ??
              it?.id ??
              it?.transaction_id ??
              it?.txn_id ??
              null;
            const status =
              (it?.status ?? it?.state ?? it?.result ?? null)
                ? String(it?.status ?? it?.state ?? it?.result).toLowerCase()
                : null;
            const error = it?.error_message ?? it?.error ?? it?.message ?? null;
            const fee = it?.fee ?? it?.charge ?? null;

            results.push({
              payout_item_id,
              reference: referenceField,
              transfer_id,
              status,
              error,
              fee,
              raw: it,
            });
          }
        } else {
          // If rawItems absent, try to infer results from top-level response — create placeholder results from transfers we sent
          for (const t of transfers) {
            results.push({
              payout_item_id: t.payout_item_id,
              reference: t.payout_item_id,
              transfer_id: null,
              status: 'queued',
              error: null,
              raw: null,
            });
          }
        }

        // Return normalized shape
        return {
          provider_batch_id,
          raw: data,
          results,
        };
      } catch (err: any) {
        logger.warn('Chapa bulkTransfer attempt failed', {
          attempt,
          err: err?.response?.data ?? err?.message ?? err,
        });
        if (attempt === 2) {
          // final attempt failed — throw so caller can mark batch failed and allow retries
          throw err;
        }
        // small backoff
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      }
    }
  }
}
