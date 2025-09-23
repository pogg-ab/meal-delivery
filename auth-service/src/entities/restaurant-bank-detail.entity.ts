// in auth-service/src/entities/restaurant-bank-detail.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Restaurant } from './restaurant.entity';

@Entity({ name: 'restaurant_bank_details' })
export class RestaurantBankDetail {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  restaurant_id: string;

  @Column()
  account_name: string;

  @Column()
  account_number: string;

  @Column()
  bank_name: string;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => Restaurant, (restaurant) => restaurant.bank_details)
  @JoinColumn({ name: 'restaurant_id' })
  restaurant: Restaurant;
}