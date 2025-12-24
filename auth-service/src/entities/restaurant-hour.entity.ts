// in auth-service/src/entities/restaurant-hour.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Restaurant } from './restaurant.entity';

@Entity({ name: 'restaurant_hours' })
export class RestaurantHour {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  restaurant_id: string;

  @Column({ type: 'int' })
  weekday: number;

  @Column({ type: 'time' })
  open_time: string;

  @Column({ type: 'time' })
  close_time: string;

  @Column({ default: false })
  is_closed: boolean;

  @ManyToOne(() => Restaurant, (restaurant) => restaurant.hours)
  @JoinColumn({ name: 'restaurant_id' })
  restaurant: Restaurant;
}