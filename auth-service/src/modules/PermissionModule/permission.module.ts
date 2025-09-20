import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PermissionsService } from './permission.service';
import { PermissionsController } from './permission.controller';
import { Permission } from '../../entities/Permission.entity';


@Module({
imports: [TypeOrmModule.forFeature([Permission])],
providers: [PermissionsService],
controllers: [PermissionsController],
exports: [PermissionsService],
})
export class PermissionsModule {}