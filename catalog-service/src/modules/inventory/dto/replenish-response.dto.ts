import { ApiProperty } from '@nestjs/swagger';

export class ReplenishResponseDto {
  @ApiProperty({ example: 'Successfully replenished stock for 3 item(s).' })
  message: string;

  @ApiProperty({ example: 3 })
  count: number;
}
