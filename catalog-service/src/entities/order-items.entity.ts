import {
Entity,
PrimaryGeneratedColumn,
Column,
ManyToOne,
JoinColumn,
} from 'typeorm';
import { Order } from './order.entity';
import { MenuItem } from './menu-item.entity';

@Entity({ name: 'order_items' })
export class OrderItem {
@PrimaryGeneratedColumn('uuid')
id: string;

@Column({ type: 'uuid' })
order_id: string;

@ManyToOne(() => Order, (order) => order.items, { onDelete: 'CASCADE' })
@JoinColumn({ name: 'order_id' })
order: Order;

@Column({ type: 'uuid', nullable: true })
menu_item_id?: string;

@ManyToOne(() => MenuItem, { nullable: true })
@JoinColumn({ name: 'menu_item_id' })
menu_item?: MenuItem;

// Snapshot of name & price at time of ordering
@Column({ type: 'varchar', length: 255 })
name: string;

@Column({ type: 'decimal', precision: 10, scale: 2 })
unit_price: number;

@Column({ type: 'int', default: 1 })
quantity: number;

@Column({ type: 'decimal', precision: 10, scale: 2 })
subtotal: number;

@Column({ type: 'text', nullable: true })
instructions?: string;
}