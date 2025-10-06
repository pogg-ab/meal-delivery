import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index } from 'typeorm';


@Entity({ name: 'restaurant_subaccounts' })
export class RestaurantSubaccount {
@PrimaryGeneratedColumn('uuid')
id: string;


@Index({ unique: true })
@Column({ type: 'uuid' })
restaurant_id: string;


@Column({ type: 'varchar', length: 255 })
chapa_subaccount_id: string;


@Column({ type: 'jsonb', nullable: true })
raw?: any;

@CreateDateColumn({ type: 'timestamp' })
onboarded_at: Date;
}