// src/entities/reward-points-balance.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity({ name: 'reward_points_balance' })
export class RewardPointsBalance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('idx_reward_balance_customer_id')
  @Column({ type: 'uuid' })
  customer_id: string;

  @Column({ type: 'int', default: 0 })
  total_points: number;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updated_at: Date;
}