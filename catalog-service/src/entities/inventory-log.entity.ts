import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Inventory } from './inventory.entity';

export enum InventoryChangeType {
  ORDER_DEDUCTION = 'ORDER_DEDUCTION',
  MANUAL_UPDATE = 'MANUAL_UPDATE',
  RESTOCK = 'RESTOCK',
  CANCEL_ROLLBACK = 'CANCEL_ROLLBACK',
}

@Entity({ name: 'inventory_logs' })
export class InventoryLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  inventory_id: string;

  @Column({ type: 'enum', enum: InventoryChangeType })
  change_type: InventoryChangeType;

  @Column({ type: 'int' })
  quantity_change: number; // e.g., -1 for a sale, +50 for a restock

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => Inventory, (inventory) => inventory.logs)
  @JoinColumn({ name: 'inventory_id' })
  inventory: Inventory;
}