import { Controller, Get, Param, Post, Body, UseGuards } from '@nestjs/common';
import { PermissionsService } from './permission.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { Permissions } from '../../common/decorators/permission.decorator';


@Controller('permissions')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionGuard)
export class PermissionsController {
constructor(private readonly permissionsService: PermissionsService) {}


@Get()
@Permissions('permissions:read')
findAll() {
return this.permissionsService.findAll();
}


@Get(':id')
@Permissions('permissions:read')
findById(@Param('id') id: string) {
return this.permissionsService.findById(id);
}


@Post()
@Permissions('permissions:create')
createPermission(@Body('name') name: string, @Body('description') description?: string) {
return this.permissionsService.createPermission(name, description);
}
}