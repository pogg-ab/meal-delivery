import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Permission } from '../../entities/Permission.entity';


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


async createPermission(name: string, description?: string) {
const permission = this.permissionsRepo.create({ name, description });
return this.permissionsRepo.save(permission);
}
}