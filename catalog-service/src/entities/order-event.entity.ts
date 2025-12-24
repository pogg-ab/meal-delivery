// src/entities/order-event.entity.ts

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Order } from './order.entity';

@Entity({ name: 'order_events' })
export class OrderEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // --- THIS IS THE FIX ---
  @Column({ type: 'uuid', nullable: true }) // <-- ADD nullable: true
  order_id: string | null;
  // -------------------------

  @ManyToOne(() => Order, (order) => order.events, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order: Order;

  @Column({ type: 'uuid', nullable: true })
  actor_id?: string;

  @Column({ type: 'varchar', length: 50 })
  action: string;

  @Column({ type: 'jsonb', nullable: true })
  meta?: Record<string, any>;

  @CreateDateColumn({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;
}