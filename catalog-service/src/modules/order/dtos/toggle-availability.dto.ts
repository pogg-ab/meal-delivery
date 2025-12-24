import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class ToggleAvailabilityDto {
  @ApiProperty({ description: 'Set true to make item available, false to hide it', example: true })
  @IsBoolean()
  is_available: boolean;
}
