import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export type DiscountType = 'percentage' | 'fixed';
export type IssuerType = 'restaurant' | 'platform' | 'shared';

@Entity({ name: 'promo_codes' })
export class PromoCode {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  code: string;

  @Column({ type: 'varchar', length: 20 })
  discount_type: DiscountType;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    transformer: { to: (v: number) => v, from: (v: string) => parseFloat(v) },
  })
  discount_value: number;

  @Column({ type: 'varchar', length: 20 })
  issuer_type: IssuerType;

  @Column({ type: 'uuid', nullable: true })
  applicable_restaurant_id?: string | null;

  // used only for 'shared' promos; percent 0..100
  @Column({ type: 'integer', nullable: true, default: 50 })
  restaurant_share_percent: number;

  @Column({ type: 'integer', nullable: true })
  max_uses?: number | null;

  @Column({ type: 'integer', default: 0 })
  uses_count: number;

  @Column({ type: 'timestamp', nullable: true })
  expiry_date?: Date | null;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({ type: 'jsonb', nullable: true })
  meta?: any;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updated_at: Date;
}
