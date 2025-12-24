import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsIn,
} from 'class-validator';

export class CreateSubaccountDto {
  @ApiProperty({ example: 'Abebe Souq' })
  @IsString()
  @IsNotEmpty()
  business_name: string;

  @ApiProperty({ example: 'Abebe Bikila' })
  @IsString()
  @IsNotEmpty()
  account_name: string;

  @ApiProperty({ example: 128 })
  @IsNumber()
  bank_code: number;

  @ApiProperty({ example: '0123456789' })
  @IsString()
  account_number: string;

  @ApiProperty({
    description:
      'Split value for this subaccount. e.g. 0.2 (20%) when split_type=percentage',
  })
  @IsNumber()
  split_value: number;

  @ApiProperty({ example: 'percentage', enum: ['percentage', 'fixed'] })
  @IsString()
  @IsIn(['percentage', 'fixed'])
  split_type: 'percentage' | 'fixed';

  @ApiProperty({
    required: false,
    description: 'Optional return url for onboarding flows',
  })
  @IsOptional()
  @IsString()
  return_url?: string;
}
