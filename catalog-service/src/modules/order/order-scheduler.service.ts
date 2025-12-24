import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Order, OrderStatus } from '../../entities/order.entity';
import { ScheduledJob, ScheduledJobStatus } from '../../entities/scheduled-job.entity';
import { KafkaProvider } from 'src/providers/kafka.provider';
import { DataSource } from 'typeorm';
import { PaymentStatus } from 'src/entities/enums/payment-status.enum';
import { OrdersService } from './order.service';
import { ScheduledJobType } from 'src/entities/enums/scheduled-job-type.enum';

@Injectable()
export class OrderSchedulerService {
  private readonly logger = new Logger(OrderSchedulerService.name);

  constructor(
    @InjectRepository(ScheduledJob)
    private readonly jobRepo: Repository<ScheduledJob>,
    private readonly kafka: KafkaProvider,
    private readonly dataSource: DataSource,
    private readonly ordersService: OrdersService,
  ) {}
@Cron(CronExpression.EVERY_MINUTE, { name: 'cancelUnpaidOrders' })
async handleUnpaidOrderCancellations() {
  this.logger.log('Running job to find and cancel unpaid immediate orders...');

  const jobsToCancel = await this.jobRepo.find({
    where: {
      runAt: LessThanOrEqual(new Date()),
      status: ScheduledJobStatus.PENDING,
      jobType: ScheduledJobType.CANCEL_UNPAID_ORDER, // <-- This is the key
    },
    relations: ['order'], // We need the order to check its payment status
    take: 50, // Process in batches
  });

  if (jobsToCancel.length === 0) {
    this.logger.log('No unpaid orders are due for cancellation.');
    return;
  }

  this.logger.log(`Found ${jobsToCancel.length} unpaid order(s) to process for cancellation.`);

  for (const job of jobsToCancel) {
    await this.processCancellationJob(job);
  }
}


// in src/modules/order/order-scheduler.service.ts

// REPLACE the entire private processCancellationJob method with this one

private async processCancellationJob(job: ScheduledJob) {
  await this.dataSource.transaction(async (manager) => {
    const jobRepo = manager.getRepository(ScheduledJob);

    // --- NEW LOGIC: Lock the job by its ID first, without any joins ---
    const lockedJob = await jobRepo.findOne({
      where: {
        id: job.id,
        status: ScheduledJobStatus.PENDING,
      },
      lock: { mode: 'pessimistic_write' },
    });

    // If another worker got here first, lockedJob will be null.
    if (!lockedJob) {
      this.logger.warn(`Cancellation job ${job.id} was already processed or locked. Skipping.`);
      return;
    }

    // Now that the job is locked, load it again WITH its relations.
    const jobWithOrder = await jobRepo.findOne({
        where: { id: lockedJob.id },
        relations: ['order'],
    });

    if (!jobWithOrder) {
        // This should theoretically never happen if the lockedJob was found
        this.logger.error(`Could not reload job ${lockedJob.id} with its order relation.`);
        return;
    }

    const order = jobWithOrder.order;
    // --- END OF NEW LOGIC ---

    if (!order) {
      this.logger.error(`Job ${jobWithOrder.id} has no order. Marking as failed.`);
      jobWithOrder.status = ScheduledJobStatus.FAILED;
      await jobRepo.save(jobWithOrder);
      return;
    }

    // FINAL CHECK: Only cancel if the order is still unpaid.
    if (order.payment_status !== PaymentStatus.PAID) {
      this.logger.warn(`Order ${order.id} is still unpaid. Automatically cancelling.`);
      try {
        await this.ordersService.cancelOrder(
          order.customer_id,
          order.id,
          'Automatically cancelled due to non-payment.',
        );
        jobWithOrder.status = ScheduledJobStatus.PROCESSED;
      } catch (e) {
        this.logger.error(`Error auto-cancelling order ${order.id}:`, e);
        jobWithOrder.status = ScheduledJobStatus.FAILED;
        jobWithOrder.meta = { error: e.message };
      }
    } else {
      this.logger.log(`Order ${order.id} was paid before cancellation job ran. Skipping.`);
      jobWithOrder.status = ScheduledJobStatus.PROCESSED;
    }

    await jobRepo.save(jobWithOrder);
  });
}
}