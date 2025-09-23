// in auth-service/src/entities/address.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Restaurant } from './restaurant.entity';
import { User } from './User.entity';

@Entity({ name: 'addresses' })
export class Address {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  user_id: string;

  @Column({ nullable: true })
  restaurant_id: string;

  @Column()
  label: string;

  @Column()
  street: string;

  @Column()
  city: string;

  @Column()
  region: string;

  @Column({ default: 'Ethiopia' })
  country: string;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Restaurant, (restaurant) => restaurant.addresses)
  @JoinColumn({ name: 'restaurant_id' })
  restaurant: Restaurant;
}