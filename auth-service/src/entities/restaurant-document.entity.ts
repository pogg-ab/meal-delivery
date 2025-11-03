// auth-service/src/entities/restaurant-document.entity.ts

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

  // --- UPDATE THIS LINE ---
  @Column({ nullable: true }) // Allow old records to have a null original_name
  original_name: string;

  // --- AND UPDATE THIS LINE ---
  @Column({ nullable: true }) // Allow old records to have a null mimetype
  mimetype: string;

  @Column({ default: 'PENDING' })
  status: string;

  @CreateDateColumn()
  uploaded_at: Date;

  @ManyToOne(() => Restaurant, (restaurant) => restaurant.documents)
  @JoinColumn({ name: 'restaurant_id' })
  restaurant: Restaurant;
}