import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
  OneToOne, // <-- ADDED
  Index,    // <-- ADDED
} from 'typeorm';
import { OrderItem } from './order-items.entity';
import { OrderEvent } from './order-event.entity';
import { OrderStatus } from './enums/order-status.enum';
import { PaymentStatus } from './enums/payment-status.enum';
import { Restaurant } from './restaurant.entity';
import { ScheduledJob } from './scheduled-job.entity'; // <-- ADDED

@Entity({ name: 'orders' })
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  customer_id: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  customer_name?: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  customer_phone?: string | null;

  @Column({ type: 'uuid' })
  restaurant_id: string;

  @ManyToOne(() => Restaurant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'restaurant_id' })
  restaurant: Restaurant;

  @Column({ type: 'enum', enum: OrderStatus, default: OrderStatus.PENDING })
  status: OrderStatus;

  @Column({ type: 'enum', enum: PaymentStatus, default: PaymentStatus.NONE })
  payment_status: PaymentStatus;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  total_amount: number;

  @Column({ type: 'varchar', length: 10, default: 'USD' })
  currency: string;

  @Column({ type: 'text', nullable: true })
  instructions?: string;

  @Column({ type: 'boolean', default: false })
  is_delivery: boolean;

  @Column({ type: 'varchar', length: 255, nullable: true })
  payment_reference?: string;

  @Column({ type: 'timestamp', nullable: true })
  paid_at?: Date;

  // NEW: payment-related fields copied from PaymentService for easy client polling
  @Column({ type: 'varchar', length: 255, nullable: true })
  tx_ref?: string | null;

  @Column({ type: 'text', nullable: true })
  checkout_url?: string | null;

  @Column({ type: 'timestamp', nullable: true })
  payment_expires_at?: Date | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  chapa_tx_id?: string | null;

  // add transformers/imports as needed
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true, transformer: { to: (v: number) => v, from: (v: string) => parseFloat(v) } })
  gross_amount?: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true, transformer: { to: (v: number) => v, from: (v: string) => parseFloat(v) } })
  discount_amount?: number;

  @Column({ type: 'jsonb', nullable: true })
  discount_breakdown?: any; // { discount_amount, restaurant_discount, platform_discount, platform_topup_needed, promo }

  @Column({ type: 'varchar', length: 64, nullable: true })
  promo_code?: string | null;

  // --- Start of NEW Scheduled Delivery Fields ---

  @Column({
    name: 'is_scheduled',
    type: 'boolean',
    default: false,
    comment: 'Flag to indicate if the order is scheduled for future delivery',
  })
  isScheduled: boolean;

  @Index('idx_orders_scheduled_delivery_time')
  @Column({
    name: 'scheduled_delivery_time',
    type: 'timestamp with time zone',
    nullable: true,
    comment: 'The specific time the scheduled order should be delivered',
  })
  scheduledDeliveryTime: Date | null;

  // --- End of NEW Scheduled Delivery Fields ---

  @CreateDateColumn({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  updated_at: Date;

  // --- Relations ---

  @OneToMany(() => OrderItem, (item) => item.order, { cascade: true })
  items: OrderItem[];

  @OneToMany(() => OrderEvent, (ev) => ev.order, { cascade: true })
  events: OrderEvent[];
  
  @OneToOne(() => ScheduledJob, (job) => job.order)
  scheduledJob: ScheduledJob;
}

export { Restaurant, OrderStatus };