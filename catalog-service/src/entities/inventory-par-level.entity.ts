import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { MenuItem } from './menu-item.entity';
import { Restaurant } from './restaurant.entity';

@Entity('inventory_par_levels')
@Unique(['menu_item_id']) // Ensures a menu item can only have one par level
export class InventoryParLevel {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  menu_item_id: string;

  @Column({ type: 'uuid' })
  restaurant_id: string;

  @Column({ type: 'integer' })
  par_level: number; // The standard quantity to reset to each day

  @ManyToOne(() => MenuItem, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'menu_item_id' })
  menu_item: MenuItem;

  @ManyToOne(() => Restaurant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'restaurant_id' })
  restaurant: Restaurant;
}