import {
  Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn,
  OneToOne, JoinColumn, OneToMany, ManyToOne
} from 'typeorm';
import { MenuItem } from './menu-item.entity';
import { InventoryLog } from './inventory-log.entity';
import { Restaurant } from './restaurant.entity';

@Entity({ name: 'inventory' })
export class Inventory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  restaurant_id: string;

  @Column()
  menu_item_id: string;

  @Column({ type: 'int', default: 5 }) 
  reorder_level: number;

  @Column({ type: 'int' })
  stock_quantity: number;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => Restaurant)
  @JoinColumn({ name: 'restaurant_id' })
  restaurant: Restaurant;

  @OneToOne(() => MenuItem, (item) => item.inventory, {
    
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'menu_item_id' })
  menu_item: MenuItem; 

  @OneToMany(() => InventoryLog, (log) => log.inventory)
  logs: InventoryLog[];
}