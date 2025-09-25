// import { Controller, Get, Param, Post, Body, UseGuards } from '@nestjs/common';
// import { UsersService } from './user.service';
// import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
// import { RolesGuard } from '../../common/guards/roles.guard';
// import { PermissionGuard } from '../../common/guards/permission.guard';
// import { Permissions } from '../../common/decorators/permission.decorator';


// @Controller('users')
// @UseGuards(JwtAuthGuard, RolesGuard, PermissionGuard)
// export class UsersController {
// constructor(private readonly usersService: UsersService) {}


// @Get()
// @Permissions('users:read')
// findAll() {
// return this.usersService.findAll();
// }


// @Get(':id')
// @Permissions('users:read')
// findById(@Param('id') id: string) {
// return this.usersService.findById(id);
// }


// @Post(':id/assign-role')
// @Permissions('users:update')
// assignRole(@Param('id') id: string, @Body('roleId') roleId: string) {
// return this.usersService.assignRole(id, roleId);
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
} from '@nestjs/common';
import { UsersService } from './user.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { Permissions } from '../../common/decorators/permission.decorator';
import { AssignRoleDto } from './dto/assign-role.dto';
import { ApiTags, ApiOperation, ApiBody, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { UserDto } from './dto/user.dto';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionGuard)
@ApiTags('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiBearerAuth('access-token')
  @Permissions('roles.manage')
  @ApiOperation({ summary: 'List all users' })
  @ApiResponse({ status: 200, type: [UserDto] })
  findAll() {
    return this.usersService.findAll();
  }

  @Get(':id')
  @ApiBearerAuth('access-token')
  @Permissions('roles.manage')
  @ApiOperation({ summary: 'Get user by id' })
  @ApiResponse({ status: 200, type: UserDto })
  findById(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  @Post(':id/assign-role')
  @ApiBearerAuth('access-token')
  @Permissions('roles.manage')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  @ApiOperation({ summary: 'Assign or update a role for a user (single-role-per-user)' })
  @ApiBody({ type: AssignRoleDto })
  @ApiResponse({ status: 200, description: 'Assignment result' })
  assignRole(@Param('id') id: string, @Body() dto: AssignRoleDto) {
    return this.usersService.assignRole(id, dto);
  }
}
