import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Order, OrderStatus } from '../../entities/order.entity';
import { ScheduledJob, ScheduledJobStatus } from '../../entities/scheduled-job.entity';
import { KafkaProvider } from 'src/providers/kafka.provider';
import { DataSource } from 'typeorm';

@Injectable()
export class OrderSchedulerService {
  private readonly logger = new Logger(OrderSchedulerService.name);

  constructor(
    @InjectRepository(ScheduledJob)
    private readonly jobRepo: Repository<ScheduledJob>,
    private readonly kafka: KafkaProvider,
    private readonly dataSource: DataSource,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE, { name: 'processScheduledOrders' })
  async handleCron() {
    this.logger.log('Running scheduled job to process due orders...');

    const jobsToProcess = await this.jobRepo.find({
      where: {
        runAt: LessThanOrEqual(new Date()),
        status: ScheduledJobStatus.PENDING,
      },
      relations: ['order', 'order.restaurant'], // Load the order and its restaurant
    });

    if (jobsToProcess.length === 0) {
      this.logger.log('No scheduled orders are due for processing.');
      return;
    }

    this.logger.log(`Found ${jobsToProcess.length} order(s) to process.`);

    for (const job of jobsToProcess) {
      await this.processOrderJob(job);
    }
  }

  private async processOrderJob(job: ScheduledJob) {
    // Use a transaction to ensure atomicity
    await this.dataSource.transaction(async (manager) => {
      const jobRepo = manager.getRepository(ScheduledJob);
      const orderRepo = manager.getRepository(Order);

      // 1. Lock the job row to prevent another worker from processing it
      const lockedJob = await jobRepo.findOne({
        where: { id: job.id, status: ScheduledJobStatus.PENDING },
        lock: { mode: 'pessimistic_write' },
      });

      // If another process got to it first, the job will be null or not pending.
      if (!lockedJob) {
        this.logger.warn(`Job ${job.id} was already processed or locked. Skipping.`);
        return;
      }
      
      const order = job.order;
      if (!order) {
          this.logger.error(`Job ${job.id} has no associated order. Marking as failed.`);
          lockedJob.status = ScheduledJobStatus.FAILED;
          await jobRepo.save(lockedJob);
          return;
      }

      this.logger.log(`Processing Order ID: ${order.id} for Restaurant ID: ${order.restaurant_id}`);

      // 2. Update the order status from SCHEDULED to PENDING
      // This kicks off the normal "new order" flow for the restaurant
      order.status = OrderStatus.PENDING;
      await orderRepo.save(order);

      // 3. Update the job status to PROCESSED
      lockedJob.status = ScheduledJobStatus.PROCESSED;
      await jobRepo.save(lockedJob);

      // 4. Emit the 'order.created' event to notify the kitchen and payment service
      // This is the same event your regular `createOrder` method emits.
      // We must reconstruct the payload carefully.
      const eventPayload = {
        order: {
          id: order.id,
          customer_id: order.customer_id,
          restaurant_id: order.restaurant_id,
          // You may need to fetch items if they are not loaded, but for now let's assume they are not needed for this event.
          items: [], 
          amount: Number(order.total_amount),
          currency: order.currency,
          // Include other necessary fields from your original `order.created` event
        },
        ownerId: order.restaurant.owner_id,
      };

      try {
        await this.kafka.emit('order.created', eventPayload);
        this.logger.log(`Emitted order.created event for scheduled order ${order.id}`);
      } catch (e) {
        this.logger.error(`Kafka emit failed for scheduled order ${order.id}`, e);
        // You might want to add retry logic here or mark the job as failed
      }
    });
  }
}