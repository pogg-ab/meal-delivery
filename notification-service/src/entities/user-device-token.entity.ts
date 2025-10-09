
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  UpdateDateColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('user_device_tokens')
export class UserDeviceToken {
  @PrimaryGeneratedColumn()
  id: number;

  @Index() // Index for faster lookups by user
 @Column({ name: 'user_id', type: 'varchar' })
userId: string;

  @Column({ name: 'device_token', type: 'text', unique: true })
  deviceToken: string;

  @Column({ type: 'varchar', length: 20 })
  platform: string; // 'web', 'android', 'ios'

  @UpdateDateColumn({
    name: 'last_active',
    type: 'timestamp with time zone',
  })
  lastActive: Date;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamp with time zone',
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt: Date;
}