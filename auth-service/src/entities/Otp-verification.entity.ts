import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, JoinColumn } from 'typeorm';
import { User } from './User.entity';


@Entity('otp_verifications')
export class OtpVerification {
@PrimaryGeneratedColumn('uuid')
otp_id: string;


@Column({ type: 'uuid' })
user_id: string;


@ManyToOne(() => User, (user) => user.refreshTokens, { onDelete: 'CASCADE' })
@JoinColumn({ name: 'user_id' })
user: User;


@Column({ type: 'text' })
otp_hash: string;


@Column({ type: 'varchar', length: 50 })
purpose: string; // registration | password_reset


@Column({ type: 'varchar', length: 20 })
channel: string; // email | sms


@Column({ type: 'integer', default: 0 })
attempts: number;


@Column({ type: 'boolean', default: false })
used: boolean;


@Column({ type: 'timestamptz' })
expires_at: Date;


@CreateDateColumn({ type: 'timestamptz' })
created_at: Date;
}