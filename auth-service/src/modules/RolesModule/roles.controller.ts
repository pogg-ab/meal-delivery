import { Controller, Get, Param, Post, Body, UseGuards } from '@nestjs/common';
import { RolesService } from './roles.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { Permissions } from '../../common/decorators/permission.decorator';


@Controller('roles')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionGuard)
export class RolesController {
constructor(private readonly rolesService: RolesService) {}


@Get()
@Permissions('roles:read')
findAll() {
return this.rolesService.findAll();
}


@Get(':id')
@Permissions('roles:read')
findById(@Param('id') id: string) {
return this.rolesService.findById(id);
}


@Post()
@Permissions('roles:create')
createRole(@Body('name') name: string, @Body('description') description?: string) {
return this.rolesService.createRole(name, description);
}


@Post(':id/assign-permission')
@Permissions('roles:update')
assignPermission(@Param('id') id: string, @Body('permissionId') permissionId: string) {
return this.rolesService.assignPermission(id, permissionId);
}
}