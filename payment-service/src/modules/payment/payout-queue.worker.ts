
// payout-queue.worker.ts (robust loader for QueueScheduler)
// payout-queue.worker.ts
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { Job } from 'bullmq';
import IORedis from 'ioredis';
import { PaymentsService } from './payment.service'; // adjust path if necessary

// Try to require bullmq at runtime (handles various bundling shapes)
const bullmqRequire: any = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('bullmq');
  } catch (e) {
    return null;
  }
})();

/** Resolve QueueScheduler constructor from bullmq in a resilient way */
function resolveQueueSchedulerCtor(): any | null {
  if (!bullmqRequire) return null;
  // common shapes:
  // - require('bullmq').QueueScheduler
  // - require('bullmq').default.QueueScheduler
  return bullmqRequire.QueueScheduler ?? (bullmqRequire.default && bullmqRequire.default.QueueScheduler) ?? null;
}

/** Resolve Worker constructor from bullmq in a resilient way */
function resolveWorkerCtor(): any | null {
  if (!bullmqRequire) return null;
  return bullmqRequire.Worker ?? (bullmqRequire.default && bullmqRequire.default.Worker) ?? null;
}

@Injectable()
export class PayoutQueueWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PayoutQueueWorker.name);
  private worker: any | null = null; // runtime Worker instance (bullmq Worker)
  private scheduler: any | null = null; // runtime QueueScheduler instance
  private redis: IORedis | null = null;

  constructor(private readonly payoutsService: PaymentsService) {}

  async onModuleInit() {
    const redisUrl =
      process.env.REDIS_URL ?? `redis://${process.env.REDIS_HOST ?? '127.0.0.1'}:${process.env.REDIS_PORT ?? 6379}`;

    // create and reuse a single ioredis connection for scheduler/worker
    this.redis = new IORedis(redisUrl, { maxRetriesPerRequest: null, enableAutoPipelining: true });

    this.redis.on('error', (err) => this.logger.error('Redis error (worker)', err?.message ?? err));
    this.redis.on('connect', () => this.logger.log(`Redis connected for worker (${redisUrl})`));

    // --- QueueScheduler (optional but recommended) ---
    const QueueSchedulerCtor = resolveQueueSchedulerCtor();

    if (!QueueSchedulerCtor) {
      this.logger.error(
        'QueueScheduler constructor not found from require("bullmq"). Worker will start WITHOUT a QueueScheduler. ' +
          'Retries/timeouts/stalled-job detection may not work properly. Ensure bullmq & ioredis are installed.',
      );
    } else {
      try {
        this.scheduler = new QueueSchedulerCtor('payout-queue', { connection: this.redis as any });
        // wait until scheduler is ready if API available
        if (typeof this.scheduler.waitUntilReady === 'function') {
          await this.scheduler.waitUntilReady();
        }
        this.logger.log('QueueScheduler initialized for queue "payout-queue"');
      } catch (err) {
        this.logger.error('Failed to instantiate QueueScheduler', (err as any)?.message ?? err);
        this.scheduler = null;
      }
    }

    // --- Worker ---
    const WorkerCtor = resolveWorkerCtor();
    const workerFactory = WorkerCtor ?? (bullmqRequire ? bullmqRequire.Worker : null);

    if (!workerFactory) {
      // As a last fallback try dynamic require; if that fails we cannot process jobs.
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const fallback = require('bullmq').Worker;
        this.worker = new fallback(
          'payout-queue',
          async (job: Job) => {
            this.logger.log(
              `Worker picked job ${job.id} (${job.name}) attemptsMade=${(job as any)?.attemptsMade ?? 0} optsAttempts=${job.opts?.attempts}`,
            );
            // allow error to bubble for retries
            return this.payoutsService.processAggregatedBatch(job.data.batchId, {
              requestedBy: job.data.requestedBy,
              force: job.data.force,
            });
          },
          { connection: this.redis as any, concurrency: Number(process.env.PAYOUT_WORKER_CONCURRENCY ?? 2) },
        );
      } catch (err) {
        this.logger.error('Failed to create Worker (no bullmq Worker constructor found)', (err as any)?.message ?? err);
        this.worker = null;
      }
    } else {
      try {
        this.worker = new workerFactory(
          'payout-queue',
          async (job: Job) => {
            this.logger.log(
              `Worker picked job ${job.id} (${job.name}) attemptsMade=${(job as any)?.attemptsMade ?? 0} optsAttempts=${job.opts?.attempts}`,
            );
            try {
              return await this.payoutsService.processAggregatedBatch(job.data.batchId, {
                requestedBy: job.data.requestedBy,
                force: job.data.force,
              });
            } catch (err) {
              // log then rethrow so bullmq will handle attempts/backoff
              this.logger.warn(`Job ${job.id} handler threw error, rethrowing for retry: ${String((err as any)?.message ?? err)}`);
              throw err;
            }
          },
          { connection: this.redis as any, concurrency: Number(process.env.PAYOUT_WORKER_CONCURRENCY ?? 2) },
        );

        // wait until worker is ready if available
        if (typeof this.worker.waitUntilReady === 'function') {
          await this.worker.waitUntilReady();
        }
      } catch (err) {
        this.logger.error('Failed to create Worker', (err as any)?.message ?? err);
        this.worker = null;
      }
    }

    // Register listeners only if worker was successfully created
    const w = this.worker;
    if (w) {
      w.on('completed', (job: Job) => this.logger.log(`Job completed ${job.id}`));
      w.on('failed', (job: Job, err: Error) =>
        this.logger.warn(`Job failed ${job?.id} attemptsMade=${(job as any)?.attemptsMade ?? 0} error=${err?.message ?? err}`),
      );

      // Optional helpful events
      if (typeof w.on === 'function') {
        w.on('stalled', (job: Job) => this.logger.warn(`Job stalled ${job?.id ?? '(unknown)'}`));
        w.on('error', (err: Error) => this.logger.error('Worker error', (err as any)?.message ?? err));
      }

      this.logger.log('Payout worker initialized and listening on "payout-queue"');
    } else {
      this.logger.error('Worker not created; payouts will not be processed. Check bullmq installation and logs above.');
    }
  }

  async onModuleDestroy() {
    // Close worker
    try {
      if (this.worker) {
        await this.worker.close();
        this.logger.log('Worker closed');
      }
    } catch (e) {
      this.logger.warn('Error closing worker', (e as any)?.message ?? e);
    }

    // Close scheduler
    try {
      if (this.scheduler) {
        if (typeof this.scheduler.close === 'function') await this.scheduler.close();
        this.logger.log('Scheduler closed');
      }
    } catch (e) {
      this.logger.warn('Error closing scheduler', (e as any)?.message ?? e);
    }

    // Close redis connection used by the worker
    try {
      if (this.redis) {
        await this.redis.quit();
        this.logger.log('Redis connection closed (worker)');
      }
    } catch (e) {
      this.logger.warn('Error quitting redis (worker)', (e as any)?.message ?? e);
    }
  }
}
