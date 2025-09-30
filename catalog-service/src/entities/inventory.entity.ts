// src/entities/inventory.entity.ts

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

  // --- REVERTING THIS PROPERTY ---
  @Column()
  restaurant_id: string;

  // --- REVERTING THIS PROPERTY ---
  @Column()
  menu_item_id: string;

  @Column({ type: 'int', default: 5 }) // Default reorder level is 5 units
  reorder_level: number;
  // --- REVERTING THIS PROPERTY ---
  @Column({ type: 'int' })
  stock_quantity: number;

  // --- REVERTING THIS PROPERTY ---
  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => Restaurant)
  @JoinColumn({ name: 'restaurant_id' })
  restaurant: Restaurant;

  @OneToOne(() => MenuItem, (item) => item.inventory)
  @JoinColumn({ name: 'menu_item_id' })
  menu_item: MenuItem; // <-- Reverted this as well for consistency

  @OneToMany(() => InventoryLog, (log) => log.inventory)
  logs: InventoryLog[];
}