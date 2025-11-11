import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { MenuItem } from './menu-item.entity';

@Entity({ name: 'customer_menu_ranking' })
@Index(['customer_id', 'menu_item_id'], { unique: true })
export class CustomerMenuRanking {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  customer_id: string;

  @Column({ type: 'uuid' })
  menu_item_id: string;

  @ManyToOne(() => MenuItem)
  @JoinColumn({ name: 'menu_item_id' })
  menu_item: MenuItem;

  @Column({ type: 'integer', default: 0 })
  order_count: number;

  @CreateDateColumn({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  updated_at: Date;
}
