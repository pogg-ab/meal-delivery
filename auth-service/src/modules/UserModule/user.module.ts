import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './user.service';
import { UsersController } from './user.controller';
import { User } from '../../entities/User.entity';
import { UserRole } from '../../entities/User-role.entity';
import { Role } from '../../entities/Role.entity';
import { AuditLog } from '../../entities/Audit-log.entity';


@Module({
imports: [TypeOrmModule.forFeature([User, UserRole, Role, AuditLog])],
providers: [UsersService],
controllers: [UsersController],
exports: [UsersService],
})
export class UsersModule {}