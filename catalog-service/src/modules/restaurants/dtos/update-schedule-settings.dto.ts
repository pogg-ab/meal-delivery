
import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min, Max } from 'class-validator';

export class UpdateScheduleSettingsDto {
  @ApiProperty({
    description: 'The minimum lead time in minutes required for a customer to schedule an order.',
    example: 60,
  })
  @IsInt()
  @Min(15, { message: 'Minimum scheduling lead time must be at least 15 minutes.' })
  @Max(1440, { message: 'Minimum scheduling lead time cannot exceed 24 hours (1440 minutes).' })
  minimumSchedulingLeadTimeMinutes: number;
}