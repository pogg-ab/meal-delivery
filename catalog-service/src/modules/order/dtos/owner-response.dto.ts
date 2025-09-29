import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class OwnerResponseDto {
  @ApiProperty()
  @IsBoolean()
  accepted: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  reason?: string;
}

