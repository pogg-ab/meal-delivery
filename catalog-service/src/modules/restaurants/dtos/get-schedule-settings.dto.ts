import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class GetScheduleSettingsDto {
  @ApiProperty({
    description: 'The minimum lead time in minutes required for a customer to schedule an order.',
    example: 60,
  })
  @Expose() // Make sure this property is included in the response
  minimumSchedulingLeadTimeMinutes: number;
}