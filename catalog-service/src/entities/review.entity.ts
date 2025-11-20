import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { MenuItem } from './menu-item.entity';
import { Order } from './order.entity';

@Entity({ name: 'reviews' })
@Index('UQ_reviews_customer_menu_item', ['customer_id', 'menu_item_id'], { 
  unique: true, 
  where: '"deleted_at" IS NULL'
})
export class Review {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index('IDX_reviews_menu_item_id')
  menu_item_id: string;

  @Column({ type: 'uuid' })
  @Index('IDX_reviews_customer_id')
  customer_id: string;

  @Column({ type: 'uuid', nullable: true })
  order_id: string | null;

  @Column({ type: 'integer' })
  rating: number; // 1-5 stars

  @Column({ type: 'text', nullable: true })
  comment: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  customer_name: string | null;

  @Column({ type: 'boolean', default: false })
  is_verified_purchase: boolean;

  @CreateDateColumn({ type: 'timestamp' })
  @Index('IDX_reviews_created_at')
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updated_at: Date;

  @DeleteDateColumn({ type: 'timestamp', nullable: true })
  deleted_at: Date | null;

  // Relations
  @ManyToOne(() => MenuItem, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'menu_item_id' })
  menu_item: MenuItem;

  @ManyToOne(() => Order, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'order_id' })
  order: Order | null;
}
