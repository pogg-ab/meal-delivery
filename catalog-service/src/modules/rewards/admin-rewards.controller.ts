// src/modules/rewards/admin-rewards.controller.ts
import {
  Controller,
  Post,
  UseGuards,
  Body,
  Get, // <-- Add Get
  Patch, // <-- Add Patch
  Param, // <-- Add Param
  ParseUUIDPipe, // <-- Add ParseUUIDPipe
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
}