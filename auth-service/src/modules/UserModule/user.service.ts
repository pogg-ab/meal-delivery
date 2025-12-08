
import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Not, Repository } from 'typeorm';
import { User } from '../../entities/User.entity';
import { UserRole } from '../../entities/User-role.entity';
import { Role } from '../../entities/Role.entity';
import { AuditLog } from '../../entities/Audit-log.entity';
import { AssignRoleDto } from './dto/assign-role.dto';
import { plainToInstance } from 'class-transformer';
import { UserDto } from './dto/user.dto';
import { ChangePasswordDto } from '../AuthModule/dtos/change-password.dto';
import * as bcrypt from 'bcrypt';
import { UpdateProfileDto } from './dto/update-profile.dto';

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

  async assignRole(userId: string, dto: AssignRoleDto, manager?: EntityManager) {
    // --- CHANGE 1: Use transactional repositories if available ---
    const usersRepo = manager ? manager.getRepository(User) : this.usersRepo;
    const userRolesRepo = manager ? manager.getRepository(UserRole) : this.userRolesRepo;
    const rolesRepo = manager ? manager.getRepository(Role) : this.rolesRepo;
    const auditRepo = manager ? manager.getRepository(AuditLog) : this.auditRepo;

    const { roleId } = dto;

    // --- CHANGE 2: Use the local repository to stay within the transaction ---
    const user = await usersRepo.findOneBy({ user_id: userId });
    if (!user) throw new NotFoundException('User not found');

    // --- ALL THE REST OF YOUR LOGIC IS UNTOUCHED ---
    const role = await rolesRepo.findOne({ where: { role_id: roleId } });
    if (!role) throw new NotFoundException('Role not found');

    const existing = await userRolesRepo.findOne({ where: { user_id: userId } });

    if (!existing) {
      const userRole = userRolesRepo.create({ user_id: userId, role_id: roleId });
      await userRolesRepo.save(userRole);
      await auditRepo.save(auditRepo.create({
        user_id: userId,
        action: `ASSIGN_ROLE:${role.name}`,
        metadata: { roleId },
      }));
      return { message: 'Role assigned successfully' };
    }

    if (existing.role_id === roleId) {
      await auditRepo.save(auditRepo.create({
        user_id: userId,
        action: `ASSIGN_ROLE:NOOP:${role.name}`,
        metadata: { roleId },
      }));
      return { message: 'User already has this role' };
    }

    const previousRoleId = existing.role_id;
    const previousRole = await rolesRepo.findOne({ where: { role_id: previousRoleId } });
    existing.role_id = roleId;
    await userRolesRepo.save(existing);
    await auditRepo.save(auditRepo.create({
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

  async removeRole(userId: string, dto: { roleId: string }, manager?: EntityManager) {
    const userRolesRepo = manager ? manager.getRepository(UserRole) : this.userRolesRepo;
    const rolesRepo = manager ? manager.getRepository(Role) : this.rolesRepo;
    const auditRepo = manager ? manager.getRepository(AuditLog) : this.auditRepo;

    const { roleId } = dto;

    // Find the specific role assignment to remove
    const userRole = await userRolesRepo.findOne({ where: { user_id: userId, role_id: roleId } });

    // If the user doesn't have this role, there's nothing to do.
    if (!userRole) {
      await auditRepo.save(auditRepo.create({
        user_id: userId,
        action: `REMOVE_ROLE:NOOP`,
        metadata: { roleId, reason: 'Role not assigned to user.' },
      }));
      return { message: 'User does not have this role.' };
    }

    // Remove the role assignment
    await userRolesRepo.remove(userRole);

    const role = await rolesRepo.findOneBy({ role_id: roleId });
    await auditRepo.save(auditRepo.create({
      user_id: userId,
      action: `REMOVE_ROLE:${role?.name ?? roleId}`,
      metadata: { roleId },
    }));

    return { message: 'Role removed successfully' };
  }

  async findByRole(roleName: string): Promise<{ id: string }[]> {
    const users = await this.usersRepo.createQueryBuilder('user')
      .innerJoin('user.roles', 'userRole')
      .innerJoin('userRole.role', 'role')
      .where('role.name = :roleName', { roleName })
      .getMany();

    
    return users.map(user => ({
      id: user.user_id,
    }));
  }

async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
  // 1. Find the user by their ID
  const user = await this.usersRepo.findOneBy({ user_id: userId });
  if (!user) {
    throw new NotFoundException('User not found');
  }

  // 2. Verify their current password is correct
  const isPasswordMatching = await bcrypt.compare(
    dto.oldPassword,
    user.password_hash,
  );

  if (!isPasswordMatching) {
    throw new UnauthorizedException('Incorrect old password');
  }

  // 3. Hash and update the new password
  const newHash = await bcrypt.hash(dto.newPassword, 10);
  user.password_hash = newHash;

  await this.usersRepo.save(user);

  // 4. Create an audit log entry
  await this.auditRepo.save(
    this.auditRepo.create({
      user_id: userId,
      action: `CHANGE_PASSWORD`,
      metadata: { changedAt: new Date() },
    }),
  );
}

async updateProfile(userId: string, dto: UpdateProfileDto): Promise<UserDto> {
  const user = await this.usersRepo.findOneBy({ user_id: userId });
  if (!user) {
    throw new NotFoundException('User not found');
  }

  // --- Check for uniqueness before updating ---
  if (dto.username && dto.username !== user.username) {
    const existing = await this.usersRepo.findOne({
      where: { username: dto.username, user_id: Not(userId) },
    });
    if (existing) {
      throw new BadRequestException('Username is already in use.');
    }
  }

  if (dto.phone && dto.phone !== user.phone) {
    const existing = await this.usersRepo.findOne({
      where: { phone: dto.phone, user_id: Not(userId) },
    });
    if (existing) {
      throw new BadRequestException('Phone number is already in use.');
    }
  }

  const oldValues = { username: user.username, phone: user.phone };
  const changes = {};

  // --- Apply changes ---
  if (dto.username) {
    user.username = dto.username;
    changes['username'] = { from: oldValues.username, to: dto.username };
  }
  if (dto.phone) {
    user.phone = dto.phone;
    changes['phone'] = { from: oldValues.phone, to: dto.phone };
  }

  const updatedUser = await this.usersRepo.save(user);

  // --- Create an audit log for the changes ---
  if (Object.keys(changes).length > 0) {
    await this.auditRepo.save(
      this.auditRepo.create({
        user_id: userId,
        action: `UPDATE_PROFILE`,
        metadata: { changes },
      }),
    );
  }

  // Return the updated user, serialized as a DTO to hide sensitive info
  return plainToInstance(UserDto, updatedUser, {
    excludeExtraneousValues: true,
  });
}
}
