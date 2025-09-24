import { Controller, Get, Param, Post, Body, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { PermissionsService } from './permission.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { Permissions } from '../../common/decorators/permission.decorator';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { CreatePermissionDto } from './dto/create-permission.dto';


@Controller('permissions')
@UseGuards(JwtAuthGuard, PermissionGuard)

export class PermissionsController {
constructor(private readonly permissionsService: PermissionsService) {}


@Get()
@ApiBearerAuth('access-token')
@Permissions('permissions.manage')
findAll() {
return this.permissionsService.findAll();
}

@Get(':id')
@ApiBearerAuth('access-token')
@Permissions('permissions.manage')
findById(@Param('id') id: string) {
return this.permissionsService.findById(id);
}

  @Post()
  @ApiBearerAuth('access-token')
  @Permissions('permissions.manage')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
  createPermission(@Body() dto: CreatePermissionDto) {
    return this.permissionsService.createPermission(dto);
  }
}