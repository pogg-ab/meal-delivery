// import { Injectable, NotFoundException } from '@nestjs/common';
// import { InjectRepository } from '@nestjs/typeorm';
// import { Repository } from 'typeorm';
// import { User } from '../../entities/User.entity';
// import { UserRole } from '../../entities/User-role.entity';
// import { Role } from '../../entities/Role.entity';
// import { AuditLog } from '../../entities/Audit-log.entity';


// @Injectable()
// export class UsersService {
// constructor(
// @InjectRepository(User) private usersRepo: Repository<User>,
// @InjectRepository(UserRole) private userRolesRepo: Repository<UserRole>,
// @InjectRepository(Role) private rolesRepo: Repository<Role>,
// @InjectRepository(AuditLog) private auditRepo: Repository<AuditLog>,
// ) {}


// async findAll(): Promise<User[]> {
// return this.usersRepo.find({ relations: ['roles'] });
// }


// async findById(userId: string): Promise<User> {
// const user = await this.usersRepo.findOne({ where: { user_id: userId }, relations: ['roles'] });
// if (!user) throw new NotFoundException('User not found');
// return user;
// }


// // async assignRole(userId: string, roleId: string) {
// // const user = await this.findById(userId);
// // const role = await this.rolesRepo.findOne({ where: { role_id: roleId } });
// // if (!role) throw new NotFoundException('Role not found');


// // const userRole = this.userRolesRepo.create({ user_id: userId, role_id: roleId });
// // await this.userRolesRepo.save(userRole);


// // await this.auditRepo.save(this.auditRepo.create({
// // user_id: userId,
// // action: `ASSIGN_ROLE:${role.name}`,
// // metadata: { roleId },
// // }));

// // return { message: 'Role assigned successfully' };
// // }

//  async assignRole(userId: string, roleId: string) {
//   const user = await this.findById(userId); // throws if user not found

//   const role = await this.rolesRepo.findOne({ where: { role_id: roleId } });
//   if (!role) throw new NotFoundException('Role not found');

//   // find an existing user-role relation (assumes single-role-per-user)
//   const existing = await this.userRolesRepo.findOne({ where: { user_id: userId } });

//   if (!existing) {
//     // no role previously assigned -> create new relation
//     const userRole = this.userRolesRepo.create({ user_id: userId, role_id: roleId });
//     await this.userRolesRepo.save(userRole);

//     await this.auditRepo.save(this.auditRepo.create({
//       user_id: userId,
//       action: `ASSIGN_ROLE:${role.name}`,
//       metadata: { roleId },
//     }));

//     return { message: 'Role assigned successfully' };
//   }

//   // existing assignment present
//   if (existing.role_id === roleId) {
//     // already same role -> idempotent
//     await this.auditRepo.save(this.auditRepo.create({
//       user_id: userId,
//       action: `ASSIGN_ROLE:NOOP:${role.name}`,
//       metadata: { roleId },
//     }));
//     return { message: 'User already has this role' };
//   }

//   // updating existing assignment to a different role
//   const previousRoleId = existing.role_id;
//   const previousRole = await this.rolesRepo.findOne({ where: { role_id: previousRoleId } });

//   existing.role_id = roleId;
//   await this.userRolesRepo.save(existing);

//   await this.auditRepo.save(this.auditRepo.create({
//     user_id: userId,
//     action: `UPDATE_ROLE:${previousRole?.name ?? previousRoleId}->${role.name}`,
//     metadata: { previousRoleId, previousRoleName: previousRole?.name ?? null, roleId },
//   }));

//   return {
//     message: 'Role updated successfully',
//     previousRoleId,
//     newRoleId: roleId,
//   };
//  }

// }


import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../entities/User.entity';
import { UserRole } from '../../entities/User-role.entity';
import { Role } from '../../entities/Role.entity';
import { AuditLog } from '../../entities/Audit-log.entity';
import { AssignRoleDto } from './dto/assign-role.dto';
import { plainToInstance } from 'class-transformer';
import { UserDto } from './dto/user.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private usersRepo: Repository<User>,
    @InjectRepository(UserRole) private userRolesRepo: Repository<UserRole>,
    @InjectRepository(Role) private rolesRepo: Repository<Role>,
    @InjectRepository(AuditLog) private auditRepo: Repository<AuditLog>,
  ) {}

  async findAll(): Promise<UserDto[]> {
    const users = await this.usersRepo.find({ relations: ['roles'] });
    return plainToInstance(UserDto, users, { excludeExtraneousValues: true });
  }

  async findById(userId: string): Promise<UserDto> {
    const user = await this.usersRepo.findOne({ where: { user_id: userId }, relations: ['roles'] });
    if (!user) throw new NotFoundException('User not found');
    return plainToInstance(UserDto, user, { excludeExtraneousValues: true });
  }

  async assignRole(userId: string, dto: AssignRoleDto) {
    const { roleId } = dto;

    const user = await this.findById(userId); // will throw NotFoundException if missing

    const role = await this.rolesRepo.findOne({ where: { role_id: roleId } });
    if (!role) throw new NotFoundException('Role not found');

    // find an existing user-role relation (assumes single-role-per-user)
    const existing = await this.userRolesRepo.findOne({ where: { user_id: userId } });

    if (!existing) {
      // no role previously assigned -> create new relation
      const userRole = this.userRolesRepo.create({ user_id: userId, role_id: roleId });
      await this.userRolesRepo.save(userRole);

      await this.auditRepo.save(this.auditRepo.create({
        user_id: userId,
        action: `ASSIGN_ROLE:${role.name}`,
        metadata: { roleId },
      }));

      return { message: 'Role assigned successfully' };
    }

    // existing assignment present
    if (existing.role_id === roleId) {
      // already same role -> idempotent
      await this.auditRepo.save(this.auditRepo.create({
        user_id: userId,
        action: `ASSIGN_ROLE:NOOP:${role.name}`,
        metadata: { roleId },
      }));
      return { message: 'User already has this role' };
    }

    // updating existing assignment to a different role
    const previousRoleId = existing.role_id;
    const previousRole = await this.rolesRepo.findOne({ where: { role_id: previousRoleId } });

    existing.role_id = roleId;
    await this.userRolesRepo.save(existing);

    await this.auditRepo.save(this.auditRepo.create({
      user_id: userId,
      action: `UPDATE_ROLE:${previousRole?.name ?? previousRoleId}->${role.name}`,
      metadata: { previousRoleId, previousRoleName: previousRole?.name ?? null, roleId },
    }));

    return {
      message: 'Role updated successfully',
      previousRoleId,
      newRoleId: roleId,
    };
  }
}
