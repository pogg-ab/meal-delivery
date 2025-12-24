// import { IsOptional, IsInt, Min } from 'class-validator';
// import { ApiPropertyOptional } from '@nestjs/swagger';

// export class GetPersonalizedMenuDto {
//   @ApiPropertyOptional({ description: 'Maximum number of items to return', default: 50 })
//   @IsOptional()
//   @IsInt()
//   @Min(1)
//   limit?: number = 50;
// }


import { IsOptional, IsInt, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class GetPersonalizedMenuDto {
  @ApiPropertyOptional({ description: 'Maximum number of items to return', default: 50 })
  @IsOptional()
  @Type(() => Number)                       // <-- important: converts "limit" from string to number
  @IsInt({ message: 'limit must be an integer number' })
  @Min(1, { message: 'limit must not be less than 1' })
  limit?: number = 50;
}
