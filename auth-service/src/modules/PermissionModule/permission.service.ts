import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { Permission } from '../../entities/Permission.entity';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { PermissionDto } from './dto/permission.dto';
import { plainToInstance } from 'class-transformer';


@Injectable()
export class PermissionsService {
constructor(
@InjectRepository(Permission) private permissionsRepo: Repository<Permission>,
) {}


async findAll(): Promise<Permission[]> {
return this.permissionsRepo.find();
}


async findById(id: string): Promise<Permission> {
const permission = await this.permissionsRepo.findOne({ where: { permission_id: id } });
if (!permission) throw new NotFoundException('Permission not found');
return permission;
}


async createPermission(dto: CreatePermissionDto): Promise<PermissionDto> {
    const permission = this.permissionsRepo.create({
      name: dto.name,
      description: dto.description ?? null,
    });

    try {
      const saved = await this.permissionsRepo.save(permission);
      // map to response DTO
      return plainToInstance(PermissionDto, saved, { excludeExtraneousValues: true });
    } catch (err) {
      // Postgres unique violation (23505) — adjust if using another DB
      if (err instanceof QueryFailedError && (err as any).code === '23505') {
        throw new ConflictException('A permission with that name already exists.');
      }
      throw new BadRequestException('Could not create permission.');
    }
  }
}