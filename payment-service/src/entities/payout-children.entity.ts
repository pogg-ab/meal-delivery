import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

const DecimalTransformer = {
  to: (v: number) => v,
  from: (v: string) =>
    v === null || typeof v === 'undefined' ? 0 : parseFloat(v),
};

@Entity({ name: 'payout_children' })
export class PayoutChild {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  order_id?: string | null;

  @Column({ type: 'uuid', nullable: true })
  payment_id?: string | null;

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

  @Column({ type: 'varchar', length: 50, default: 'pending' })
  status: 'pending' | 'batched' | 'paid' | 'failed' | 'cancelled';

  @Index()
  @Column({ type: 'uuid', nullable: true })
  parent_aggregate_id?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  reason?: string | null;

  @Column({ type: 'jsonb', nullable: true })
  meta?: any;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updated_at: Date;
}
