// src/modules/reports/entities/menu-inventory.entity.ts

import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('menu_inventory_history') // Using a descriptive name
@Index(['restaurantId', 'batchDate'])
export class MenuInventoryHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  menuItemId: string;

  @Column({ type: 'uuid' })
  restaurantId: string;

  @Column({ type: 'date' })
  batchDate: Date;

  @Column({ type: 'integer' })
  openingStock: number;

  @Column({ type: 'integer', default: 0 })
  soldQuantity: number;

  @Column({ type: 'integer', default: 0 })
  manualAdjustments: number; // Sum of positive/negative manual changes

  @Column({ type: 'integer' })
  closingStock: number;

  @CreateDateColumn()
  createdAt: Date;
}