import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class RescheduleOrderDto {
  @ApiProperty({
    description: 'The new future LOCAL date and time in Ethiopia for the delivery (Format: YYYY-MM-DDTHH:MM:SS).',
    example: '2025-11-25T18:00:00', // Example: 6 PM local time
  })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/, {
    message: 'newDeliveryTime must be in the format YYYY-MM-DDTHH:MM:SS',
  })
  newDeliveryTime: string; // Changed from Date to string
}