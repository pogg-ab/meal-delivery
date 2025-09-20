import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RolesService } from './roles.service';
import { RolesController } from './roles.controller';
import { Role } from '../../entities/Role.entity';
import { RolePermission } from '../../entities/Role-permission.entity';


@Module({
imports: [TypeOrmModule.forFeature([Role, RolePermission])],
providers: [RolesService],
controllers: [RolesController],
exports: [RolesService],
})
export class RolesModule {}
