import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn, OneToOne, DeleteDateColumn,
} from 'typeorm';
import { MenuCategory } from './menu-category.entity';
import { Inventory } from './inventory.entity';

@Entity({ name: 'menu_items' })
export class MenuItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  category_id: string;

  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  price: number;

  @Column({ default: true })
  is_available: boolean;

  @Column({ type: 'text', nullable: true })
  image_url: string;

  @Column({ type: 'decimal', precision: 3, scale: 2, nullable: true })
  average_rating: number | null;

  @Column({ type: 'integer', default: 0 })
  total_reviews: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @DeleteDateColumn()
  deleted_at: Date;

  @ManyToOne(() => MenuCategory, (category) => category.menu_items)
  @JoinColumn({ name: 'category_id' })
  category: MenuCategory;
  
 @OneToOne(() => Inventory, (inventory) => inventory.menu_item) // Updated to match Inventory entity
  inventory: Inventory;
  restaurant: any;
}