import { Controller, Get, Param, Post, Body, UseGuards } from '@nestjs/common';
import { UsersService } from './user.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { Permissions } from '../../common/decorators/permission.decorator';


@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionGuard)
export class UsersController {
constructor(private readonly usersService: UsersService) {}


@Get()
@Permissions('users:read')
findAll() {
return this.usersService.findAll();
}


@Get(':id')
@Permissions('users:read')
findById(@Param('id') id: string) {
return this.usersService.findById(id);
}


@Post(':id/assign-role')
@Permissions('users:update')
assignRole(@Param('id') id: string, @Body('roleId') roleId: string) {
return this.usersService.assignRole(id, roleId);
}
}