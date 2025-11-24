// src/modules/rewards/rewards.controller.ts
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOkResponse, ApiOperation } from '@nestjs/swagger'; // Ensure ApiBearerAuth is imported
import { RewardsService } from './rewards.service';
import { PaginationQueryDto } from './dto/pagination-query.dto';
import { RewardPointsBalance } from '../../entities/reward-points-balance.entity';
import { RewardPointsLedger } from '../../entities/reward-points-ledger.entity';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { UserId } from '../../common/decorator/user-id.decorator';
import { RewardRule } from 'src/entities/reward-rule.entity';

@ApiTags('Rewards')
@Controller('rewards')
@UseGuards(JwtAuthGuard) // Protect all routes
@ApiBearerAuth('access-token') // <-- THE FIX: Apply the named BearerAuth to the entire controller
export class RewardsController {
  constructor(private readonly rewardsService: RewardsService) {}

  @Get('/balance')
  @ApiOkResponse({
    description: "Returns the customer's current point balance.",
    type: RewardPointsBalance,
  })
  async getBalance(@UserId() customerId: string): Promise<RewardPointsBalance> {
    return this.rewardsService.getBalanceForCustomer(customerId);
  }

  @Get('/ledger')
  @ApiOkResponse({
    description: 'Returns a paginated history of point transactions.',
    type: [RewardPointsLedger],
  })
  async getLedger(
    @UserId() customerId: string,
    @Query() paginationQuery: PaginationQueryDto,
  ): Promise<RewardPointsLedger[]> {
    return this.rewardsService.getLedgerForCustomer(customerId, paginationQuery);
  }
@Get('/rules')
  @ApiOperation({ summary: 'Get all currently active reward rules for customers.' })
  @ApiOkResponse({
    description: 'A list of active earning and redemption rules.',
    type: [RewardRule],
  })
  async getActiveRules(): Promise<RewardRule[]> {
    return this.rewardsService.getActivePublicRules();
  }

  
}