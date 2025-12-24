// import { Injectable, NotFoundException } from '@nestjs/common';
// import { InjectRepository } from '@nestjs/typeorm';
// import { Repository } from 'typeorm';
// import { Role } from '../../entities/Role.entity';
// import { RolePermission } from '../../entities/Role-permission.entity';


// @Injectable()
// export class RolesService {
// constructor(
// @InjectRepository(Role) private rolesRepo: Repository<Role>,
// @InjectRepository(RolePermission) private rolePermissionsRepo: Repository<RolePermission>,
// ) {}


// async findAll(): Promise<Role[]> {
// return this.rolesRepo.find({ relations: ['rolePermissions'] });
// }


// async findById(roleId: string): Promise<Role> {
// const role = await this.rolesRepo.findOne({ where: { role_id: roleId }, relations: ['rolePermissions'] });
// if (!role) throw new NotFoundException('Role not found');
// return role;
// }


// async createRole(name: string, description?: string) {
// const role = this.rolesRepo.create({ name, description });
// return this.rolesRepo.save(role);
// }


// async assignPermission(roleId: string, permissionId: string) {
// const role = await this.findById(roleId);
// if (!role) throw new NotFoundException('Role not found');

// const rolePermission = this.rolePermissionsRepo.create({ role_id: roleId, permission_id: permissionId });
// return this.rolePermissionsRepo.save(rolePermission);
// }
// }

import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, QueryFailedError, In } from 'typeorm';
import { Role } from '../../entities/Role.entity';
import { RolePermission } from '../../entities/Role-permission.entity';
import { Permission } from '../../entities/Permission.entity';
import { CreateRoleDto } from './dto/create-role.dto';
import { AssignPermissionsDto } from './dto/assign-permission.dto';
import { RoleDto } from './dto/role.dto';
import { plainToInstance } from 'class-transformer';

@Injectable()
export class RolesService {
  constructor(
    @InjectRepository(Role) private rolesRepo: Repository<Role>,
    @InjectRepository(RolePermission) private rolePermissionsRepo: Repository<RolePermission>,
    @InjectRepository(Permission) private permissionsRepo: Repository<Permission>,
  ) {}

//   async findAll(): Promise<RoleDto[]> {
//     const roles = await this.rolesRepo.find({ relations: ['rolePermissions'] });
//     return plainToInstance(RoleDto, roles, { excludeExtraneousValues: true });
//   }

//   async findById(roleId: string): Promise<RoleDto> {
//     const role = await this.rolesRepo.findOne({
//       where: { role_id: roleId },
//       relations: ['rolePermissions'],
//     });
//     if (!role) throw new NotFoundException('Role not found');
//     return plainToInstance(RoleDto, role, { excludeExtraneousValues: true });
//   }


async findAll(): Promise<RoleDto[]> {
    const roles = await this.rolesRepo.find({
      relations: ['rolePermissions', 'rolePermissions.permission'],
      order: { name: 'ASC' }, // optional nice-to-have
    });
    return plainToInstance(RoleDto, roles, { excludeExtraneousValues: true });
  }

  async findById(roleId: string): Promise<RoleDto> {
    const role = await this.rolesRepo.findOne({
      where: { role_id: roleId },
      relations: ['rolePermissions', 'rolePermissions.permission'],
    });
    if (!role) throw new NotFoundException('Role not found');
    return plainToInstance(RoleDto, role, { excludeExtraneousValues: true });
  }

  async createRole(dto: CreateRoleDto): Promise<RoleDto> {
    const role = this.rolesRepo.create({ name: dto.name, description: dto.description ?? null});
    try {
      const saved = await this.rolesRepo.save(role);
      return plainToInstance(RoleDto, saved, { excludeExtraneousValues: true });
    } catch (err) {
      if (err instanceof QueryFailedError && (err as any).code === '23505') {
        throw new ConflictException('A role with that name already exists.');
      }
      throw new BadRequestException('Could not create role.');
    }
  }

  /**
   * Assign multiple permissions to a role.
   * - Validates role exists
   * - Validates permission ids exist
   * - Skips already assigned (idempotent)
   * - Writes new assignments in a transaction
   */
  async assignPermissions(roleId: string, dto: AssignPermissionsDto): Promise<RoleDto> {
    // ensure role exists
    const role = await this.rolesRepo.findOne({ where: { role_id: roleId } });
    if (!role) throw new NotFoundException('Role not found');

    // validate permission ids exist
    const foundPermissions = await this.permissionsRepo.find({
      where: { permission_id: In(dto.permissionIds) },
    });
    const foundIds = new Set(foundPermissions.map((p) => p.permission_id));
    const missing = dto.permissionIds.filter((id) => !foundIds.has(id));
    if (missing.length > 0) {
      throw new NotFoundException(`Permissions not found: ${missing.join(', ')}`);
    }

    // find which are already assigned
    const existingRPs = await this.rolePermissionsRepo.find({
      where: { role_id: roleId, permission_id: In(dto.permissionIds) },
    });
    const alreadyAssigned = new Set(existingRPs.map((r) => r.permission_id));

    const toCreateIds = dto.permissionIds.filter((id) => !alreadyAssigned.has(id));
    if (toCreateIds.length === 0) {
      // nothing new to add
      const current = await this.rolesRepo.findOne({
        where: { role_id: roleId },
        relations: ['rolePermissions'],
      });
      return plainToInstance(RoleDto, current, { excludeExtraneousValues: true });
    }

    // create & save inside transaction
    try {
      await this.rolePermissionsRepo.manager.transaction(async (manager) => {
        const entities = toCreateIds.map((pid) =>
          manager.create(RolePermission, {
            role_id: roleId,
            permission_id: pid,
          }),
        );
        // save all new relations
        await manager.save(RolePermission, entities);
      });
    } catch (err) {
      if (err instanceof QueryFailedError && (err as any).code === '23505') {
        throw new ConflictException('One or more permissions already assigned to this role.');
      }
      throw new BadRequestException('Could not assign permissions to role.');
    }

    // reload role with relations and return
    const updated = await this.rolesRepo.findOne({
      where: { role_id: roleId },
      relations: ['rolePermissions'],
    });
    return plainToInstance(RoleDto, updated, { excludeExtraneousValues: true });
  }


  async deleteRole(roleId: string, purgeOrphanPermissions = false): Promise<{
    deletedRoleId: string;
    orphanPermissionsDeletedCount: number;
    orphanPermissionIds?: string[];
  }> {
    // make sure role exists
    const role = await this.rolesRepo.findOne({ where: { role_id: roleId } });
    if (!role) throw new NotFoundException('Role not found');

    return await this.rolesRepo.manager.transaction(async (manager) => {
      // 1) Delete the role (DB FKs with ON DELETE CASCADE will remove role_permissions)
      await manager.delete(Role, { role_id: roleId });

      let deletedPermissionIds: string[] = [];

      if (purgeOrphanPermissions) {
        // 2) Find permission ids that have no role_permissions rows referencing them
        // We'll LEFT JOIN role_permissions and select permissions where rp is NULL.
        const orphanRows: Array<{ permission_id: string }> = await manager
          .createQueryBuilder(Permission, 'p')
          .leftJoin(RolePermission, 'rp', 'rp.permission_id = p.permission_id')
          .where('rp.permission_id IS NULL')
          .select('p.permission_id', 'permission_id')
          .getRawMany();

        const orphanIds = orphanRows.map((r) => r.permission_id);
        if (orphanIds.length > 0) {
          // 3) Delete orphan permissions
          await manager.delete(Permission, { permission_id: In(orphanIds) });
          deletedPermissionIds = orphanIds;
        }
      }

      return {
        deletedRoleId: roleId,
        orphanPermissionsDeletedCount: deletedPermissionIds.length,
        orphanPermissionIds: deletedPermissionIds,
      };
    });
  }
}
