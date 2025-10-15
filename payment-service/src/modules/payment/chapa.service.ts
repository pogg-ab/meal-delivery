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
    this.secret = process.env.CHAPA_SECRET!;
    this.client = axios.create({ baseURL: process.env.CHAPA_BASE_URL || 'https://api.chapa.co', timeout: 10000 });
  }
  
  private headers() {
    return { Authorization: `Bearer ${this.secret}`, 'Content-Type': 'application/json' };
  }

  // async initializeTransaction(payload: any) {
  //   for (let attempt = 0; attempt < 3; attempt++) {
  //     try {
  //       const res = await this.client.post('/v1/transaction/initialize', payload, { headers: this.headers() });
  //       return res.data;
  //     } catch (err: any) {
  //       this.logger.warn('Chapa init attempt failed', { attempt, err: err?.message });
  //       if (attempt === 2) throw err;
  //       await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
  //     }
  //   }
  // }

  async initializeTransaction(payload: any) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        let headers: Record<string, string> = { ...this.headers(), 'Accept': 'application/json' };
        let body: any = payload;

        if (payload instanceof URLSearchParams) {
          headers['Content-Type'] = 'application/x-www-form-urlencoded';
          body = payload.toString(); // URL-encoded string
        } else {
          headers['Content-Type'] = 'application/json';
          body = payload;
        }

        const res = await this.client.post('/v1/transaction/initialize', body, { headers });
        return res.data;
      } catch (err: any) {
        this.logger.warn('Chapa init attempt failed', { attempt, err: err?.response?.data ?? err?.message });
        if (attempt === 2) throw err;
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      }
    }
  }

  async verifyTransaction(tx_ref: string) {
    const res = await this.client.get(`/v1/transaction/verify/${encodeURIComponent(tx_ref)}`, { headers: this.headers() });
    return res.data;
  }

  async createSubaccount(payload: any) {
    const res = await this.client.post('/v1/subaccount', payload, { headers: this.headers() });
    return res.data;
  }

  async refundTransaction(payload: any) {
    const res = await this.client.post('/v1/transaction/refund', payload, { headers: this.headers() });
    return res.data;
  }
}