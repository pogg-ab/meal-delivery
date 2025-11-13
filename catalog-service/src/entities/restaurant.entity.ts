// in catalog-service/src/entities/restaurant.entity.ts

import { Entity, PrimaryColumn, Column, OneToMany } from 'typeorm';
import { MenuCategory } from './menu-category.entity';

@Entity({ name: 'restaurants' })
export class Restaurant {
  @PrimaryColumn('uuid')
  id: string;

  @Column()
  name: string;

  // --- NEW FIELDS TO STORE FROM KAFKA EVENT ---

  @Column({ type: 'text', nullable: true }) // Use 'text' for potentially long descriptions
  description: string;

  @Column({ nullable: true })
  street: string;

  @Column({ nullable: true })
  city: string;

  @Column({ nullable: true })
  region: string;

  @Column({ nullable: true })
  country: string;

  @Column({
    type: 'decimal',
    precision: 9, // Total digits
    scale: 6,      // Digits after decimal
    nullable: true,
  })
  latitude: number;

  @Column({
    type: 'decimal',
    precision: 9,
    scale: 6,
    nullable: true,
  })
  longitude: number;

  // --- END OF NEW FIELDS ---

  @Column()
  owner_id: string;

  @Column({ default: false })
  is_active: boolean;

  @Column({ type: 'decimal', precision: 3, scale: 2, nullable: true })
  average_rating: number | null;

  @Column({ type: 'integer', default: 0 })
  total_reviews: number;

  @OneToMany(() => MenuCategory, (category) => category.restaurant)
  menu_categories: MenuCategory[];
}