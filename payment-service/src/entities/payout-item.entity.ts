import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity({ name: 'payout_items' })
export class PayoutItem {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  payout_batch_id?: string | null;

  @Column({ type: 'uuid', nullable: true })
  order_id?: string | null;

  @Column({ type: 'uuid', nullable: true })
  payment_id?: string | null;

  @Column({ type: 'uuid' })
  restaurant_id: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  reason?: string; // 'promo_platform_topup' or 'promo_platform_topup_aggregated'

  @Column({ type: 'uuid', nullable: true })
  parent_item_id?: string | null; // points to aggregated item if this is a child

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    transformer: { to: (v: number) => v, from: (v: string) => parseFloat(v) },
  })
  amount: number;

  @Column({ type: 'varchar', length: 50, default: 'pending' })
  status: 'pending' | 'batched' | 'processing' | 'paid' | 'failed' | 'cancelled';

  // bank details (copied from restaurant_subaccounts at aggregation time)
  @Column({ type: 'varchar', length: 64, nullable: true })
  account_number?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  account_name?: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  bank_code?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  provider_transfer_id?: string | null;

  @Column({ type: 'jsonb', nullable: true })
  provider_response?: any;

  @Column({ type: 'integer', default: 0 })
  attempt_count: number;

  @Column({ type: 'text', nullable: true })
  last_error?: string | null;

  @Column({ type: 'jsonb', nullable: true })
  meta?: any;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updated_at: Date;
}
