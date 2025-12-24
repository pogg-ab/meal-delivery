// src/modules/rewards/rewards.module.ts

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RewardsService } from './rewards.service';
import { RewardPointsBalance } from '../../entities/reward-points-balance.entity';
import { RewardPointsLedger } from '../../entities/reward-points-ledger.entity';
import { RewardsController } from './rewards.controller';
import { AdminRewardsController } from './admin-rewards.controller';
import { RewardRule } from 'src/entities/reward-rule.entity'; // <-- Ensure this is imported

@Module({
  imports: [
    TypeOrmModule.forFeature([
      RewardPointsBalance,
      RewardPointsLedger,
      RewardRule, // <-- THE FIX IS ADDING THIS LINE
    ]),
  ],
  controllers: [RewardsController, AdminRewardsController],
  providers: [RewardsService],
  exports: [RewardsService],
})
export class RewardsModule {}