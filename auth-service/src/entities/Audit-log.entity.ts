import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { User } from './User.entity';

@Entity('audit_logs')
export class AuditLog {
@PrimaryGeneratedColumn('uuid')
log_id: string;


@Column({ type: 'uuid', nullable: true })
user_id?: string | null;


@Column({ type: 'varchar', length: 100 })
action: string;


@Column({ type: 'jsonb', nullable: true })
metadata?: Record<string, any>;


@CreateDateColumn({ type: 'timestamptz' })
created_at: Date;


@ManyToOne(() => User, (user) => user.auditLogs, { onDelete: 'SET NULL' })
@JoinColumn({ name: 'user_id' })
user: User;
}
