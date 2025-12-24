import { ApiProperty } from '@nestjs/swagger';

export class PlatformAccountResponseDto {
  @ApiProperty()
  chapa_subaccount_id: string;

  @ApiProperty({ required: false })
  raw?: any;

  @ApiProperty()
  created_at: Date;

  @ApiProperty()
  updated_at: Date;
}
