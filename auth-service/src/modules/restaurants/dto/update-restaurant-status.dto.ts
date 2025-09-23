import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsNotEmpty } from 'class-validator';

export enum AdminUpdateStatus {
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export class UpdateRestaurantStatusDto {
  @ApiProperty({ enum: AdminUpdateStatus })
  @IsEnum(AdminUpdateStatus)
  @IsNotEmpty()
  status: AdminUpdateStatus;

  @ApiProperty({ required: false, description: 'Required if status is REJECTED' })
  @IsOptional()
  @IsString()
  rejection_reason?: string;
}