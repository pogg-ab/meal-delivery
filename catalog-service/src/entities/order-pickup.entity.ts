// file: src/entities/order-pickup.entity.ts
import {
Entity,
PrimaryGeneratedColumn,
Column,
CreateDateColumn,
UpdateDateColumn,
Index,
ManyToOne,
JoinColumn,
} from 'typeorm';
import { Order } from './order.entity';


@Entity({ name: 'order_pickups' })
export class OrderPickup {
// pickup_code(pickup_code: any) {
//     throw new Error('Method not implemented.');
// }
@PrimaryGeneratedColumn('uuid')
id: string;

@Index({ unique: true })
@Column({ type: 'uuid' })
order_id: string;


@ManyToOne(() => Order, { onDelete: 'CASCADE' })
@JoinColumn({ name: 'order_id' })
order?: Order;

// store only hash of code
@Column({ type: 'varchar', length: 128, name: 'pickup_code_hash' })
pickup_code_hash: string;


@Column({ type: 'varchar', length: 1024, nullable: true })
pickup_token?: string;


@Column({ type: 'timestamp', nullable: true })
expires_at?: Date;


@Column({ type: 'boolean', default: false })
verified: boolean;


@Column({ type: 'uuid', nullable: true })
verified_by?: string | null;


@Column({ type: 'timestamp', nullable: true })
verified_at?: Date | null;


// attempt tracking
@Column({ type: 'int', default: 0 })
attempts_count: number;


@Column({ type: 'int', default: 5 })
max_attempts: number;


@Column({ type: 'timestamp', nullable: true })
last_attempt_at?: Date | null;


@CreateDateColumn({ type: 'timestamp' })
created_at: Date;


@UpdateDateColumn({ type: 'timestamp' })
updated_at: Date;
}