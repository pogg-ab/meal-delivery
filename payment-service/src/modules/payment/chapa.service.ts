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

  async initializeTransaction(payload: any) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await this.client.post('/v1/transaction/initialize', payload, { headers: this.headers() });
        return res.data;
      } catch (err: any) {
        this.logger.warn('Chapa init attempt failed', { attempt, err: err?.message });
        if (attempt === 2) throw err;
        await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
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

// import { Injectable, Logger } from '@nestjs/common';
// import { HttpService } from '@nestjs/axios';
// import { lastValueFrom, throwError } from 'rxjs';
// import { catchError, retry } from 'rxjs/operators';
// import type { AxiosError } from 'axios';

// @Injectable()
// export class ChapaService {
//   private readonly logger = new Logger(ChapaService.name);

//   constructor(private readonly httpService: HttpService) {}

//   private async executeRequest<T>(observable$) {
//     return lastValueFrom(
//       observable$.pipe(
//         retry({ count: 3, delay: (err, retryCount) => {
//           this.logger.warn(`Chapa request failed. Retrying attempt ${retryCount + 1}...`, { message: err.message });
//           return 500 * (retryCount + 1);
//         }}),
//         catchError((err: AxiosError) => {
//           this.logger.error('Chapa request failed after retries', err.message);
//           return throwError(() => err);
//         }),
//       ),
//     ) as Promise<T>;
//   }

//   async initializeTransaction(payload: any) {
//     const observable$ = this.httpService.post('/v1/transaction/initialize', payload);
//     return this.executeRequest<any>(observable$);
//   }

//   async verifyTransaction(tx_ref: string) {
//     const observable$ = this.httpService.get(`/v1/transaction/verify/${encodeURIComponent(tx_ref)}`);
//     return this.executeRequest<any>(observable$);
//   }

//   async createSubaccount(payload: any) {
//     const observable$ = this.httpService.post('/v1/transaction/subaccount', payload);
//     return this.executeRequest<any>(observable$);
//   }

//   async refundTransaction(payload: any) {
//     const observable$ = this.httpService.post('/v1/transaction/refund', payload);
//     return this.executeRequest<any>(observable$);
//   }
// }

