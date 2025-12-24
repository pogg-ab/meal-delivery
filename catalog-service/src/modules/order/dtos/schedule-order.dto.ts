// in src/modules/order/dtos/schedule-order.dto.ts

import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, Matches } from 'class-validator';

export class ScheduleOrderDto {
  @ApiProperty({
    description: 'The ID of the existing PENDING order to be scheduled.',
    example: '1159086a-2ecc-4d9c-9130-ffb2ee3f6625',
  })
  @IsUUID()
  orderId: string;

  @ApiProperty({
    description: 'The future LOCAL date and time in Ethiopia for the delivery (Format: YYYY-MM-DDTHH:MM:SS).',
    example: '2025-11-24T17:00:00', // Example: 5 PM local time
  })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/, {
    message: 'scheduledDeliveryTime must be in the format YYYY-MM-DDTHH:MM:SS',
  })
  scheduledDeliveryTime: string; // We now accept a string
}