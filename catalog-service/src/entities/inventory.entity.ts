import {
  Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn,
  OneToOne, JoinColumn, OneToMany,
} from 'typeorm';
import { MenuItem } from './menu-item.entity';
import { InventoryLog } from './inventory-log.entity';

@Entity({ name: 'inventory' })
export class Inventory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  menu_item_id: string;

  @Column({ type: 'int' })
  stock_quantity: number;

  @UpdateDateColumn()
  updated_at: Date;

  @OneToOne(() => MenuItem, (item) => item.inventory)
  @JoinColumn({ name: 'menu_item_id' })
  menu_item: MenuItem;

  @OneToMany(() => InventoryLog, (log) => log.inventory)
  logs: InventoryLog[];
}