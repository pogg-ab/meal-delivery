import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from '../../entities/Role.entity';
import { RolePermission } from '../../entities/Role-permission.entity';


@Injectable()
export class RolesService {
constructor(
@InjectRepository(Role) private rolesRepo: Repository<Role>,
@InjectRepository(RolePermission) private rolePermissionsRepo: Repository<RolePermission>,
) {}


async findAll(): Promise<Role[]> {
return this.rolesRepo.find({ relations: ['rolePermissions'] });
}


async findById(roleId: string): Promise<Role> {
const role = await this.rolesRepo.findOne({ where: { role_id: roleId }, relations: ['rolePermissions'] });
if (!role) throw new NotFoundException('Role not found');
return role;
}


async createRole(name: string, description?: string) {
const role = this.rolesRepo.create({ name, description });
return this.rolesRepo.save(role);
}


async assignPermission(roleId: string, permissionId: string) {
const role = await this.findById(roleId);
if (!role) throw new NotFoundException('Role not found');


const rolePermission = this.rolePermissionsRepo.create({ role_id: roleId, permission_id: permissionId });
return this.rolePermissionsRepo.save(rolePermission);
}
}