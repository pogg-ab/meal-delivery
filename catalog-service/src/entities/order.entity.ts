import {
Entity,
PrimaryGeneratedColumn,
Column,
ManyToOne,
OneToMany,
CreateDateColumn,
UpdateDateColumn,
JoinColumn,
} from 'typeorm';
import { OrderItem } from './order-items.entity';
import { OrderEvent } from './order-event.entity';
import { OrderStatus } from './enums/order-status.enum';
import { PaymentStatus } from './enums/payment-status.enum';
import { Restaurant } from './restaurant.entity';

@Entity({ name: 'orders' })
export class Order {
@PrimaryGeneratedColumn('uuid')
id: string;

@Column({ type: 'uuid' })
customer_id: string;

@Column({ type: 'varchar', length: 255, nullable: true })
customer_name?: string | null;

@Column({ type: 'varchar', length: 50, nullable: true })
customer_phone?: string | null;

@Column({ type: 'uuid' })
restaurant_id: string;

@ManyToOne(() => Restaurant, { onDelete: 'CASCADE' })
@JoinColumn({ name: 'restaurant_id' })
restaurant: Restaurant;

@Column({ type: 'enum', enum: OrderStatus, default: OrderStatus.PENDING })
status: OrderStatus;

@Column({ type: 'enum', enum: PaymentStatus, default: PaymentStatus.NONE })
payment_status: PaymentStatus;

@Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
total_amount: number;

@Column({ type: 'varchar', length: 10, default: 'USD' })
currency: string;

@Column({ type: 'text', nullable: true })
instructions?: string;

@Column({ type: 'boolean', default: false })
is_delivery: boolean;

@Column({ type: 'varchar', length: 255, nullable: true })
payment_reference?: string;

@Column({ type: 'timestamp', nullable: true })
paid_at?: Date;

// NEW: payment-related fields copied from PaymentService for easy client polling
@Column({ type: 'varchar', length: 255, nullable: true })
tx_ref?: string | null;

@Column({ type: 'text', nullable: true })
checkout_url?: string | null;

@Column({ type: 'timestamp', nullable: true })
payment_expires_at?: Date | null;

@Column({ type: 'varchar', length: 255, nullable: true })
chapa_tx_id?: string | null;

@OneToMany(() => OrderItem, (item) => item.order, { cascade: true })
items: OrderItem[];

@OneToMany(() => OrderEvent, (ev) => ev.order, { cascade: true })
events: OrderEvent[];


@CreateDateColumn({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
created_at: Date;


@UpdateDateColumn({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
updated_at: Date;
}

export { Restaurant, OrderStatus };
