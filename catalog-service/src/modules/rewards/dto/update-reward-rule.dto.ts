// src/modules/rewards/dto/update-reward-rule.dto.ts
import { PartialType } from '@nestjs/swagger';
import { CreateRewardRuleDto } from './create-reward-rule.dto';

export class UpdateRewardRuleDto extends PartialType(CreateRewardRuleDto) {}