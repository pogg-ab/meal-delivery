import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export type PaymentStatus = 'initiated' | 'paid' | 'failed' | 'refunded';

@Entity({ name: 'payments' })
export class Payment {
@PrimaryGeneratedColumn('uuid')
id: string;

@Index({ unique: true })
@Column({ type: 'uuid' })
order_id: string;

@Index({ unique: true })
@Column({ type: 'varchar', length: 255 })
tx_ref: string;

@Column({ type: 'varchar', length: 255, nullable: true })
chapa_tx_id?: string;

@Column({ type: 'decimal', precision: 12, scale: 2, transformer: { to: (v: number) => v, from: (v: string) => parseFloat(v) } })
amount: number;

@Column({ type: 'varchar', length: 10, default: 'ETB' })
currency: string;

@Column({ type: 'varchar', length: 20 })
status: PaymentStatus;

@Column({ type: 'jsonb', nullable: true })
payment_data?: any;

@CreateDateColumn({ type: 'timestamp' })
created_at: Date;

@UpdateDateColumn({ type: 'timestamp' })
updated_at: Date;
  paid_at: Date;
}