import { ApiProperty } from '@nestjs/swagger';
import { IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { SetParLevelDto } from './set-par-level.dto';

export class BulkSetParLevelDto {
  @ApiProperty({
    description: 'An array of par level objects to set.',
    type: [SetParLevelDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SetParLevelDto)
  items: SetParLevelDto[];
}