// in auth-service/src/entities/restaurant-document.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Restaurant } from './restaurant.entity';

@Entity({ name: 'restaurant_documents' })
export class RestaurantDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  restaurant_id: string;

  @Column()
  document_type: string;

  @Column()
  document_url: string;

  @Column({ default: 'PENDING' })
  status: string;

  @CreateDateColumn()
  uploaded_at: Date;

  @ManyToOne(() => Restaurant, (restaurant) => restaurant.documents)
  @JoinColumn({ name: 'restaurant_id' })
  restaurant: Restaurant;
}