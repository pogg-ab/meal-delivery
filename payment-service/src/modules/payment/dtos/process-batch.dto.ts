// File: src/payout/dtos/process-batch.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsBoolean } from 'class-validator';

export class ProcessBatchDto {
  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  sync?: boolean;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}
