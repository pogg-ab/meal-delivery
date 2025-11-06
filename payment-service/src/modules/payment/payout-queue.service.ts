// File: src/payout/queue/payout-queue.service.ts
// payout-queue.service.ts
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Queue, JobsOptions } from 'bullmq';
import IORedis from 'ioredis';

@Injectable()
export class PayoutQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(PayoutQueueService.name);
  private readonly queue: Queue;
  private readonly redis: IORedis;

  constructor() {
    const redisUrl = process.env.REDIS_URL ?? `redis://${process.env.REDIS_HOST ?? '127.0.0.1'}:${process.env.REDIS_PORT ?? 6379}`;

    this.redis = new IORedis(redisUrl, {
      maxRetriesPerRequest: null,
      enableAutoPipelining: true,
    });

    this.redis.on('error', (err) => this.logger.error('Redis connection error', err?.message ?? err));
    this.redis.on('connect', () => this.logger.log(`Connected to Redis (${redisUrl})`));

    // create the Queue using the same connection object
    // require bullmq at runtime to avoid TS import mismatch issues in some environments
    // but types are okay because we're using Queue from bullmq types
    const bullmq = require('bullmq') as any;
    const QueueCtor = bullmq?.Queue ?? bullmq?.default?.Queue ?? bullmq;
    this.queue = new QueueCtor('payout-queue', { connection: this.redis as any });

    this.logger.log(`Payout queue initialized (redis=${redisUrl})`);
  }

  async addProcessBatchJob(payload: { batchId: string; requestedBy?: string; requestId?: string }, opts?: Partial<JobsOptions>) {
    const defaultOpts: JobsOptions = {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      timeout: 120000,
      removeOnComplete: true,
      removeOnFail: false,
    } as any;

    const job = await this.queue.add('process-batch', payload, { ...(defaultOpts as any), ...(opts ?? {}) });

    // debug: log job options so we can confirm attempts/backoff
    this.logger.log(`Enqueued process-batch job id=${job.id} batchId=${payload.batchId} attempts=${(job.opts as any)?.attempts}`);
    return job;
  }

  async onModuleDestroy() {
    try {
      await this.queue.close();
      this.logger.log('Payout queue closed');
    } catch (e) {
      this.logger.warn('Error closing payout queue', (e as any)?.message ?? e);
    }

    try {
      await this.redis.quit();
      this.logger.log('Redis connection closed (queue service)');
    } catch (e) {
      this.logger.warn('Error quitting redis (queue service)', (e as any)?.message ?? e);
    }
  }
}
