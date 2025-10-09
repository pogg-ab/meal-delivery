import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity({ name: 'platform_account' })
export class PlatformAccount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // chapa subaccount id for the platform (string returned by Chapa)
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255 })
  chapa_subaccount_id: string;

  // raw response returned from Chapa when created/updated
  @Column({ type: 'jsonb', nullable: true })
  raw?: any;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updated_at: Date;
}
