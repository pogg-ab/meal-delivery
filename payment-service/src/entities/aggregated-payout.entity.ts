import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

const DecimalTransformer = {
  to: (v: number) => v,
  from: (v: string) => (v === null || typeof v === 'undefined' ? 0 : parseFloat(v)),
};

@Entity({ name: 'aggregated_payouts' })
export class AggregatedPayout {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  payout_batch_id?: string | null;

  @Index()
  @Column({ type: 'uuid' })
  restaurant_id: string;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    transformer: DecimalTransformer,
  })
  amount: number;

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

  @Column({ type: 'varchar', length: 50, default: 'batched' })
  status: 'batched' | 'processing' | 'paid' | 'failed' | 'cancelled';

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
