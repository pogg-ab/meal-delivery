import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './User.entity';



@Entity('refresh_tokens')
export class RefreshToken {
@PrimaryGeneratedColumn('uuid')
id: string;


@Column({ type: 'uuid' })
user_id: string;


@ManyToOne(() => User, (user) => user.refreshTokens, { onDelete: 'CASCADE' })
@JoinColumn({ name: 'user_id' })
user: User;


// stored hashed (sha256 or bcrypt)
@Column({ type: 'varchar', length: 512 })
token_hash: string;


@Column({ type: 'timestamptz' })
expires_at: Date;


@Column({ type: 'boolean', default: false })
revoked: boolean;


@CreateDateColumn({ type: 'timestamptz' })
created_at: Date;


@UpdateDateColumn({ type: 'timestamptz' })
updated_at: Date;
}
