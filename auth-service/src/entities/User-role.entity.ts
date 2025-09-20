import { Entity, PrimaryColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from './User.entity';
import { Role } from './Role.entity';

@Entity('user_roles')
export class UserRole {
@PrimaryColumn('uuid')
user_id: string;


@PrimaryColumn('uuid')
role_id: string;


@ManyToOne(() => User, (user) => user.roles, { onDelete: 'CASCADE' })
@JoinColumn({ name: 'user_id' })
user: User;


@ManyToOne(() => Role, (role) => role.userRoles, { onDelete: 'CASCADE' })
@JoinColumn({ name: 'role_id' })
role: Role;
}
