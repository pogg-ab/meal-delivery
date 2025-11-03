import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'payout_batches' })
export class PayoutBatch {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ type: 'varchar', length: 50, default: 'pending' })
  status: 'pending' | 'created' | 'processing' | 'completed' | 'failed';

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: { to: (v: number) => v, from: (v: string) => parseFloat(v) },
  })
  total_amount: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  provider_batch_id?: string | null;

  @Column({ type: 'integer', default: 0 })
  attempt_count: number;

  @Column({ type: 'jsonb', nullable: true })
  meta?: any;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  processed_at?: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updated_at: Date;
}
