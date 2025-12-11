import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Order } from './order.entity';
import { ScheduledJobType } from './enums/scheduled-job-type.enum';

export enum ScheduledJobStatus {
  PENDING = 'pending',
  PROCESSED = 'processed',
  FAILED = 'failed',
}

@Entity('scheduled_jobs')
export class ScheduledJob {
  @PrimaryGeneratedColumn()
  id: number;

  @OneToOne(() => Order, (order) => order.scheduledJob, {
    onDelete: 'CASCADE', // If the order is deleted, this job is also deleted
    nullable: false,
  })
  @JoinColumn({ name: 'order_id' }) // This creates the order_id foreign key column
  order: Order;

  @Index('idx_scheduled_jobs_run_at') // Creates the index for faster lookups
  @Column({
    name: 'run_at',
    type: 'timestamp with time zone',
  })
  runAt: Date;

  @Column({
    type: 'enum',
    enum: ScheduledJobStatus,
    default: ScheduledJobStatus.PENDING,
  })
  status: ScheduledJobStatus;

  @Column({
    name: 'last_attempt',
    type: 'timestamp with time zone',
    nullable: true,
  })
  lastAttempt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({
    type: 'enum',
    enum: ScheduledJobType,
    default: ScheduledJobType.PROCESS_SCHEDULED_ORDER,
  })
  jobType: ScheduledJobType;
  // --- END ADD ---

  // --- ADD THIS NEW COLUMN (for error details) ---
  @Column({ type: 'jsonb', nullable: true })
  meta: any;
}