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
  Min,
  Max,
} from 'class-validator';
import { RuleType } from 'src/entities/enums/rule-type.enum';

export class CreateRewardRuleDto {
  @ApiProperty({
    description: 'A unique, descriptive name for the rule.',
    example: 'Standard Earning Rule',
  })
  @IsString()
  @IsNotEmpty()
  rule_name: string;

  @ApiProperty({
    description: 'The type of the rule, either for earning or redeeming points.',
    enum: RuleType,
    example: RuleType.EARNING,
  })
  @IsEnum(RuleType)
  type: RuleType;

  @ApiProperty({
    description: 'For EARNING: points per currency unit. For REDEMPTION: currency per point.',
    example: 0.1,
  })
  @IsNumber()
  @IsPositive()
  conversion_rate: number;

  // --- ADD THIS ENTIRE PROPERTY ---
  @ApiProperty({
    description: '(Optional) The minimum order total required for an EARNING rule to apply.',
    example: 25.00,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  min_order_value?: number;
  // --------------------------------

  // --- ADD ApiProperty HERE ---
  @ApiProperty({
    description: '(Optional) The max percentage of an order that can be discounted with a REDEMPTION rule.',
    example: 50,
    default: 100,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  max_redeem_percentage?: number;

  @ApiProperty({
    description: '(Optional) Whether the rule is currently active.',
    required: false,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @ApiProperty({
    description: '(Optional) The UTC date-time when the rule becomes active (ISO 8601 format).',
    required: false,
    example: '2024-12-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  start_date?: string;

  @ApiProperty({
    description: '(Optional) The UTC date-time when the rule expires (ISO 8601 format).',
    required: false,
    example: '2024-12-31T23:59:59.000Z',
  })
  @IsOptional()
  @IsDateString()
  end_date?: string;
}