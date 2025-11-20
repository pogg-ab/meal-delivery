// PASTE THIS ENTIRE BLOCK INTO: catalog-service/src/entities/restaurant.entity.ts

import { Entity, PrimaryColumn, Column, OneToMany } from 'typeorm';
import { MenuCategory } from './menu-category.entity';

@Entity({ name: 'restaurants' })
export class Restaurant {
  @PrimaryColumn('uuid')
  id: string;

  @Column()
  name: string;
  
  @Column({ type: 'text', nullable: true })
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
    precision: 9,
    scale: 6,
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

  @Column({ 
    type: 'tsvector', 
    select: false,
    nullable: true 
  })
  document_tsvector: any;

  @Column()
  owner_id: string;

  @Column({ default: false })
  is_active: boolean;

  // --- MERGE RESOLUTION: KEPT BOTH SETS OF CHANGES ---

  // *** START: Friend's changes for Reviews & Ratings ***
  @Column({ type: 'decimal', precision: 3, scale: 2, nullable: true })
  average_rating: number | null;

  @Column({ type: 'integer', default: 0 })
  total_reviews: number;
  // *** END: Friend's changes for Reviews & Ratings ***


  // *** START: Your changes for Operating Hours ***
  @Column({ type: 'time', nullable: true, comment: "Sunday opening time" })
  sunday_open: string;

  @Column({ type: 'time', nullable: true, comment: "Sunday closing time" })
  sunday_close: string;

  @Column({ type: 'time', nullable: true, comment: "Monday opening time" })
  monday_open: string;

  @Column({ type: 'time', nullable: true, comment: "Monday closing time" })
  monday_close: string;

  @Column({ type: 'time', nullable: true, comment: "Tuesday opening time" })
  tuesday_open: string;

  @Column({ type: 'time', nullable: true, comment: "Tuesday closing time" })
  tuesday_close: string;

  @Column({ type: 'time', nullable: true, comment: "Wednesday opening time" })
  wednesday_open: string;

  @Column({ type: 'time', nullable: true, comment: "Wednesday closing time" })
  wednesday_close: string;

  @Column({ type: 'time', nullable: true, comment: "Thursday opening time" })
  thursday_open: string;

  @Column({ type: 'time', nullable: true, comment: "Thursday closing time" })
  thursday_close: string;

  @Column({ type: 'time', nullable: true, comment: "Friday opening time" })
  friday_open: string;

  @Column({ type: 'time', nullable: true, comment: "Friday closing time" })
  friday_close: string;

  @Column({ type: 'time', nullable: true, comment: "Saturday opening time" })
  saturday_open: string;

  @Column({ type: 'time', nullable: true, comment: "Saturday closing time" })
  saturday_close: string;
  // *** END: Your changes for Operating Hours ***

  @OneToMany(() => MenuCategory, (category) => category.restaurant)
  menu_categories: MenuCategory[];
}