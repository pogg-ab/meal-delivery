// src/entities/reward-rule.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum RuleType {
  EARNING = 'EARNING',
  REDEMPTION = 'REDEMPTION',
}

@Entity({ name: 'reward_rules' })
export class RewardRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  rule_name: string;

  @Column({ type: 'enum', enum: RuleType })
  type: RuleType;

  // For EARNING rules: points per currency unit (e.g., 0.1 for 1 point per 10 currency)
  // For REDEMPTION rules: currency per point (e.g., 0.1 for 1 currency per 10 points)
  @Column({ type: 'decimal', precision: 10, scale: 4 })
  conversion_rate: number;

  @Column({ type: 'boolean', default: false })
  is_active: boolean;

  @Column({ type: 'timestamp with time zone', nullable: true })
  start_date: Date | null;

  @Column({ type: 'timestamp with time zone', nullable: true })
  end_date: Date | null;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updated_at: Date;
}