// src/entities/reward-points-ledger.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { RewardType } from './enums/reward-type.enum'; // <-- CORRECTED PATH

@Entity({ name: 'reward_points_ledger' })
export class RewardPointsLedger {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('idx_reward_ledger_customer_id')
  @Column({ type: 'uuid' })
  customer_id: string;

  @Index('idx_reward_ledger_order_id')
  @Column({ type: 'uuid', nullable: true })
  order_id: string | null;

  @Column({
    type: 'int',
    comment: 'Positive for earning, negative for spending.',
  })
  points: number;

  @Column({ type: 'enum', enum: RewardType })
  type: RewardType;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description: string | null;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  created_at: Date;
}