
// import { Type } from 'class-transformer';
// import { IsArray, ValidateNested, ArrayMinSize } from 'class-validator';
// import { ReplenishItemDto } from './replenish-item.dto';

// export class ReplenishInventoryDto {
//   @IsArray()
//   @ValidateNested({ each: true })
//   @ArrayMinSize(1)
//   @Type(() => ReplenishItemDto)
//   items: ReplenishItemDto[];
// }

import { Type } from 'class-transformer';
import { IsArray, ValidateNested, ArrayMinSize } from 'class-validator';
import { ReplenishItemDto } from './replenish-item.dto';
import { ApiProperty } from '@nestjs/swagger';

export class ReplenishInventoryDto {
  @ApiProperty({
    description: 'Array of items to replenish',
    type: [ReplenishItemDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @ArrayMinSize(1)
  @Type(() => ReplenishItemDto)
  items: ReplenishItemDto[];
}
