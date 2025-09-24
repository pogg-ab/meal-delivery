// import { Controller, Get, Param, Post, Body, UseGuards } from '@nestjs/common';
// import { RolesService } from './roles.service';
// import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
// import { RolesGuard } from '../../common/guards/roles.guard';
// import { PermissionGuard } from '../../common/guards/permission.guard';
// import { Permissions } from '../../common/decorators/permission.decorator';


// @Controller('roles')
// @UseGuards(JwtAuthGuard, RolesGuard, PermissionGuard)
// export class RolesController {
// constructor(private readonly rolesService: RolesService) {}


// @Get()
// @Permissions('roles.manage')
// findAll() {
// return this.rolesService.findAll();
// }


// @Get(':id')
// @Permissions('roles.manage')
// findById(@Param('id') id: string) {
// return this.rolesService.findById(id);
// }


// @Post()
// @Permissions('roles.manage')
// createRole(@Body('name') name: string, @Body('description') description?: string) {
// return this.rolesService.createRole(name, description);
// }


// @Post(':id/assign-permission')
// @Permissions('roles.manage')
// assignPermission(@Param('id') id: string, @Body('permissionId') permissionId: string) {
// return this.rolesService.assignPermission(id, permissionId);
// }
// }

import {
  Controller,
  Get,
  Param,
  Post,
  Body,
  UseGuards,
  UsePipes,
  ValidationPipe,
  Delete,
  Query,
  ParseBoolPipe,
} from '@nestjs/common';
import { RolesService } from './roles.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { Permissions } from '../../common/decorators/permission.decorator';
import { CreateRoleDto } from './dto/create-role.dto';
import { AssignPermissionsDto } from './dto/assign-permission.dto';
import { RoleDto } from './dto/role.dto';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiBody, ApiQuery } from '@nestjs/swagger';

@Controller('roles')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionGuard)
@ApiTags('roles')
@ApiBearerAuth()
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @ApiBearerAuth('access-token')
  @Permissions('roles.manage')
  @ApiOperation({ summary: 'List all roles' })
  @ApiResponse({ status: 200, description: 'List of roles', type: [RoleDto] })
  findAll() {
    return this.rolesService.findAll();
  }

  @Get(':id')
  @ApiBearerAuth('access-token')
  @Permissions('roles.manage')
  @ApiOperation({ summary: 'Get role by id' })
  @ApiResponse({ status: 200, description: 'Role', type: RoleDto })
  findById(@Param('id') id: string) {
    return this.rolesService.findById(id);
  }

  @Post()
  @ApiBearerAuth('access-token')
  @Permissions('roles.manage')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }))
  @ApiOperation({ summary: 'Create a new role' })
  @ApiResponse({ status: 201, description: 'Created role', type: RoleDto })
  createRole(@Body() dto: CreateRoleDto) {
    return this.rolesService.createRole(dto);
  }

  // Multi-assign endpoint
  @Post(':id/assign-permissions')
  @ApiBearerAuth('access-token')
  @Permissions('roles.manage')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  @ApiOperation({ summary: 'Assign multiple permissions to a role' })
  @ApiBody({ type: AssignPermissionsDto })
  @ApiResponse({ status: 200, description: 'Updated role with assigned permissions', type: RoleDto })
  assignPermissions(@Param('id') id: string, @Body() dto: AssignPermissionsDto) {
    return this.rolesService.assignPermissions(id, dto);
  }

  @Delete(':id')
  @ApiBearerAuth('access-token')
  @Permissions('roles.manage')
  @ApiOperation({ summary: 'Delete a role (with cascade delete of role-permissions). Optionally purge orphan permissions.' })
  @ApiQuery({ name: 'purge', required: false, description: 'If true, delete Permission rows that are left orphaned (no assigned roles).' })
  @ApiResponse({ status: 200, description: 'Deletion result object' })
  async deleteRole(
    @Param('id') id: string,
    @Query('purge', ParseBoolPipe) purge = false,
  ) {
    return this.rolesService.deleteRole(id, purge);
  }
}
