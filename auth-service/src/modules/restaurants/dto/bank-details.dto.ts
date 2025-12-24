import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BankDetailsDto {
  @ApiProperty({ example: 'My Restaurant Inc' })
  @IsString()
  account_name: string;

  @ApiProperty({ example: '1000123456789' })
  @IsString()
  account_number: string;

  @ApiProperty({ example: 'Commercial Bank of Ethiopia' })
  @IsString()
  bank_name: string;
}