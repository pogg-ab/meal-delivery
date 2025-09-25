import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  ManyToOne, JoinColumn, OneToMany, DeleteDateColumn,
} from 'typeorm';
import { Restaurant } from './restaurant.entity';
import { MenuItem } from './menu-item.entity';

@Entity({ name: 'menu_categories' })
export class MenuCategory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  restaurant_id: string;

  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @CreateDateColumn()
  created_at: Date;

  @DeleteDateColumn()
  deleted_at: Date;

  @ManyToOne(() => Restaurant, (restaurant) => restaurant.menu_categories)
  @JoinColumn({ name: 'restaurant_id' })
  restaurant: Restaurant;

  @OneToMany(() => MenuItem, (item) => item.category)
  menu_items: MenuItem[];
}