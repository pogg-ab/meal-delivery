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

  
  @Column({ type: 'decimal', precision: 10, scale: 4 })
  conversion_rate: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
    nullable: false,
    comment: 'The minimum order total required for this rule to apply.',
  })
  min_order_value: number;

  @Column({
    type: 'int',
    default: 100,
    comment: 'The maximum percentage of an order total that can be paid for with points using this rule.',
  })
  max_redeem_percentage: number;

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