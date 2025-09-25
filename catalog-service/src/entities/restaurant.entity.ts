// in catalog-service/src/entities/restaurant.entity.ts

import { Entity, PrimaryColumn, Column, OneToMany } from 'typeorm';
import { MenuCategory } from './menu-category.entity';

@Entity({ name: 'restaurants' })
export class Restaurant {
  @PrimaryColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  owner_id: string;

  @Column({ default: false })
  is_active: boolean;

  @OneToMany(() => MenuCategory, (category) => category.restaurant)
  menu_categories: MenuCategory[];
}