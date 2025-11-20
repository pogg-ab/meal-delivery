// src/modules/rewards/dto/create-reward-rule.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsNumber,
  IsPositive,
  IsOptional,
  IsBoolean,
  IsDateString,
} from 'class-validator';
import { RuleType } from 'src/entities/enums/rule-type.enum';

export class CreateRewardRuleDto {
  @ApiProperty({ example: 'Standard Earning Rule' })
  @IsString()
  @IsNotEmpty()
  rule_name: string;

  @ApiProperty({ enum: RuleType, example: RuleType.EARNING })
  @IsEnum(RuleType)
  type: RuleType;

  @ApiProperty({
    description: 'For EARNING: points per currency unit (e.g., 0.1 for 1 point per 10 currency). For REDEMPTION: currency per point (e.g., 0.1 for 1 currency per 10 points).',
    example: 0.1,
  })
  @IsNumber()
  @IsPositive()
  conversion_rate: number;

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @ApiProperty({ required: false, description: 'The UTC date-time when the rule becomes active.' })
  @IsOptional()
  @IsDateString()
  start_date?: string;

  @ApiProperty({ required: false, description: 'The UTC date-time when the rule expires.' })
  @IsOptional()
  @IsDateString()
  end_date?: string;
}