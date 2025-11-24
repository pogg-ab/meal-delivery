// src/modules/rewards/admin-rewards.controller.ts
import {
  Controller,
  Post,
  UseGuards,
  Body,
  Get, // <-- Add Get
  Patch, // <-- Add Patch
  Param, // <-- Add Param
  ParseUUIDPipe,
  Query,
  Delete, // <-- Add ParseUUIDPipe
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOkResponse, ApiOperation, ApiParam } from '@nestjs/swagger';
import { RewardsService } from './rewards.service';
import { AdminAdjustPointsDto } from './dto/admin-adjust-points.dto';
import { RewardPointsBalance } from 'src/entities/reward-points-balance.entity';

// Import your existing security components
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorator/roles.decorator';

import { RewardRule } from 'src/entities/reward-rule.entity'; // <-- Add
import { CreateRewardRuleDto } from './dto/create-reward-rule.dto'; // <-- Add
import { UpdateRewardRuleDto } from './dto/update-reward-rule.dto'; // <-- Add
import { PaginationQueryDto } from './dto/pagination-query.dto';

@ApiTags('Admin - Rewards')
@ApiBearerAuth('access-token') // Use the named scheme we confirmed works
@UseGuards(JwtAuthGuard, RolesGuard) // Apply both authentication and authorization guards
@Controller('admin/rewards')
export class AdminRewardsController {
  constructor(private readonly rewardsService: RewardsService) {}

  @Post('adjust')
  @Roles('platform_admin') // This endpoint is restricted to platform_admin
  @ApiOperation({ summary: 'Manually add or remove points from a customer\'s balance.' })
  @ApiOkResponse({
    description: 'Points adjusted successfully. Returns the updated balance.',
    type: RewardPointsBalance,
  })
  async adjustPoints(
    @Body() adjustPointsDto: AdminAdjustPointsDto,
  ): Promise<RewardPointsBalance> {
    return this.rewardsService.adminAdjustPoints(adjustPointsDto);
  }
  @Post('rules')
  @Roles('platform_admin')
  @ApiOperation({ summary: 'Create a new reward rule.' })
  @ApiOkResponse({ type: RewardRule })
  async createRule(@Body() dto: CreateRewardRuleDto): Promise<RewardRule> {
    return this.rewardsService.createRule(dto);
  }

  @Get('rules')
  @Roles('platform_admin')
  @ApiOperation({ summary: 'List all reward rules.' })
  @ApiOkResponse({ type: [RewardRule] })
  async findAllRules(): Promise<RewardRule[]> {
    return this.rewardsService.findAllRules();
  }
  
  @Get('rules/:id')
  @Roles('platform_admin')
  @ApiOperation({ summary: 'Get a single reward rule by its ID.' })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiOkResponse({ type: RewardRule })
  async findRuleById(@Param('id', ParseUUIDPipe) id: string): Promise<RewardRule> {
    return this.rewardsService.findRuleById(id);
  }

  @Patch('rules/:id')
  @Roles('platform_admin')
  @ApiOperation({ summary: 'Update an existing reward rule.' })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiOkResponse({ type: RewardRule })
  async updateRule(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRewardRuleDto,
  ): Promise<RewardRule> {
    return this.rewardsService.updateRule(id, dto);
  }

  @Delete('rules/:id') 
  @Roles('platform_admin')
  @ApiOperation({ summary: 'Permanently delete a reward rule.' })
  @ApiParam({ name: 'id', type: 'string', description: 'The ID of the rule to delete.' })
  @ApiOkResponse({
    description: 'Confirms that the rule was successfully deleted.',
  })
  async deleteRule(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ ok: boolean; message:string }> {
    return this.rewardsService.deleteRule(id);
  }


  @Get('users')
  @Roles('platform_admin')
  @ApiOperation({ summary: 'List all users and their point balances.' })
  @ApiOkResponse({ type: [RewardPointsBalance] })
  async listUsersWithBalances(
    @Query() pagination: PaginationQueryDto
  ): Promise<RewardPointsBalance[]> {
    return this.rewardsService.getUsersWithBalances(pagination);
  }

  @Get('reports/top-earners')
  @Roles('platform_admin')
  @ApiOperation({ summary: 'Get the top reward point earners.' })
  async getTopEarners(@Query('limit') limit?: number): Promise<RewardPointsBalance[]> {
    return this.rewardsService.getTopEarners(limit);
  }

  @Get('reports/liabilities')
  @Roles('platform_admin')
  @ApiOperation({ summary: 'Calculate the total outstanding points across all customers.' })
  async getTotalLiabilities(): Promise<{ total_outstanding_points: number }> {
    return this.rewardsService.calculateTotalLiabilities();
  }

  @Get('reports/monthly-activity')
  @Roles('platform_admin')
  @ApiOperation({ summary: 'Get a monthly breakdown of points earned vs. redeemed.' })
  async getMonthlyActivity(): Promise<any[]> {
    return this.rewardsService.getMonthlyActivity();
  }

}