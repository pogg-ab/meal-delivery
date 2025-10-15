import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './User.entity';
import { Address } from './address.entity';
import { RestaurantHour } from './restaurant-hour.entity';
import { RestaurantDocument } from './restaurant-document.entity';
import { RestaurantBankDetail } from './restaurant-bank-detail.entity';

// Enum for the restaurant's onboarding status
export enum RestaurantStatus {
  PENDING = 'PENDING',
  UNDER_REVIEW = 'UNDER_REVIEW',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

@Entity({ name: 'restaurants' })
export class Restaurant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  owner_id: string;

  @Column({ unique: true })
  name: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ unique: true })
  email: string;

  @Column()
  phone: string;

  @Column({
    type: 'enum',
    enum: RestaurantStatus,
    default: RestaurantStatus.PENDING,
  })
  status: RestaurantStatus;

  @Column({ default: false })
  is_active: boolean; // Becomes true only when APPROVED

  @Column({ type: 'text', nullable: true }) // <-- NEWLY ADDED COLUMN
  rejection_reason: string;

   @Column({
    type: 'numeric',
    precision: 3, // allows up to 9.99 but we'll keep ratings between 0 and 5
    scale: 2,
    default: 0,
  })

  average_rating: number;

  @Column({ type: 'integer', default: 0 })
  ratings_count: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  // --- Relationships ---

  @OneToOne(() => User)
  @JoinColumn({ name: 'owner_id' })
  owner: User;

  @OneToMany(() => Address, (address) => address.restaurant)
  addresses: Address[];

  @OneToMany(() => RestaurantHour, (hour) => hour.restaurant)
  hours: RestaurantHour[];

  @OneToMany(() => RestaurantDocument, (doc) => doc.restaurant)
  documents: RestaurantDocument[];

  @OneToMany(() => RestaurantBankDetail, (detail) => detail.restaurant)
  bank_details: RestaurantBankDetail[];
}