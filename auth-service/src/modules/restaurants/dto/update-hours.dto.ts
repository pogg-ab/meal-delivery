import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  ValidateNested,
  IsInt,
  Min,
  Max,
  IsMilitaryTime,
  IsBoolean,
  IsOptional,
} from 'class-validator';
import { Type } from 'class-transformer';

// This is the same DTO from registration, but for clarity it can be in its own class
export class RestaurantHourDto {
  @ApiProperty({ example: 1, description: 'Day of the week (0=Sunday, 1=Monday, ..., 6=Saturday)' })
  @IsInt()
  @Min(0)
  @Max(6)
  weekday: number;

  @ApiProperty({ example: '08:00', description: 'Opening time in HH:MM format' })
  @IsMilitaryTime()
  open_time: string;

  @ApiProperty({ example: '22:00', description: 'Closing time in HH:MM format' })
  @IsMilitaryTime()
  close_time: string;

  @ApiProperty({ example: false, description: 'Set to true if the restaurant is closed on this day', required: false })
  @IsBoolean()
  @IsOptional()
  is_closed?: boolean;
}

// This DTO ensures the incoming body is an array of the correct objects
export class UpdateHoursDto {
    @ApiProperty({ type: [RestaurantHourDto] })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => RestaurantHourDto)
    hours: RestaurantHourDto[];
}