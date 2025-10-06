import {
  Controller,
  Get,
  Param,
  Post,
  Body,
  UseGuards,
  UsePipes,
  ValidationPipe,
  Req,
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
  
  @Get('me')
  // @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: "Get authenticated user's profile" })
  @ApiResponse({ status: 200, type: UserDto })
  getProfile(@Req() req: any) {
    const userId: string = req?.user?.userId;
    console.log(req.user);
    return this.usersService.findById(userId);
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
  @ApiOperation({ summary: 'Assign or update a role for a user (single-role-per-user) admin only.' })
  @ApiBody({ type: AssignRoleDto })
  @ApiResponse({ status: 200, description: 'Assignment result' })
  assignRole(@Param('id') id: string, @Body() dto: AssignRoleDto) {
    return this.usersService.assignRole(id, dto);
  }
}
