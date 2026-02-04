import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { UserRole } from './User-role.entity';
import { RefreshToken } from './Refresh-token.entity';
import { AuditLog } from './Audit-log.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  user_id: string;

  @Column({ type: 'varchar', length: 50, unique: true, nullable: true })
  username?: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  email: string;

  @Column({ type: 'varchar', length: 255, nullable: false })
  password_hash: string;

  @Column({ type: 'varchar', length: 20, unique: true, nullable: true })
  phone?: string;

//   @Column({ type: 'geography', spatialFeatureType: 'Point', srid: 4326, nullable: true })
//   location?: string;

  @Column({ type: 'jsonb', nullable: true })
  preferences?: Record<string, any>;

  @Column({ type: 'integer', default: 0 })
  loyalty_points: number;

  @Column({ type: 'boolean', default: false })
  is_verified: boolean;

  @Column({ type: 'varchar', length: 6, nullable: true })
  otp_code?: string;

  @Column({ type: 'timestamp', nullable: true })
  otp_expires_at?: Date;

  @Column({ type: 'timestamp', nullable: true })
  verified_at?: Date;

  @Column({ type: 'varchar', length: 20, nullable: true })
  provider?: string; // 'google' or 'facebook'

  @Column({ type: 'varchar', length: 100, nullable: true })
  provider_id?: string;

  @Column({ type: 'text', nullable: true })
  profile_picture?: string;
  @CreateDateColumn({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  updated_at: Date;

  @OneToMany(() => UserRole, (userRole) => userRole.user)
  roles: UserRole[];

  @OneToMany(() => RefreshToken, (token) => token.user)
  refreshTokens: RefreshToken[];

  @OneToMany(() => AuditLog, (log) => log.user)
  auditLogs: AuditLog[];
}

