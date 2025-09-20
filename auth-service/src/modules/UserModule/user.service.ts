import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../entities/User.entity';
import { UserRole } from '../../entities/User-role.entity';
import { Role } from '../../entities/Role.entity';
import { AuditLog } from '../../entities/Audit-log.entity';


@Injectable()
export class UsersService {
constructor(
@InjectRepository(User) private usersRepo: Repository<User>,
@InjectRepository(UserRole) private userRolesRepo: Repository<UserRole>,
@InjectRepository(Role) private rolesRepo: Repository<Role>,
@InjectRepository(AuditLog) private auditRepo: Repository<AuditLog>,
) {}


async findAll(): Promise<User[]> {
return this.usersRepo.find({ relations: ['roles'] });
}


async findById(userId: string): Promise<User> {
const user = await this.usersRepo.findOne({ where: { user_id: userId }, relations: ['roles'] });
if (!user) throw new NotFoundException('User not found');
return user;
}


async assignRole(userId: string, roleId: string) {
const user = await this.findById(userId);
const role = await this.rolesRepo.findOne({ where: { role_id: roleId } });
if (!role) throw new NotFoundException('Role not found');


const userRole = this.userRolesRepo.create({ user_id: userId, role_id: roleId });
await this.userRolesRepo.save(userRole);


await this.auditRepo.save(this.auditRepo.create({
user_id: userId,
action: `ASSIGN_ROLE:${role.name}`,
metadata: { roleId },
}));


return { message: 'Role assigned successfully' };
}
}