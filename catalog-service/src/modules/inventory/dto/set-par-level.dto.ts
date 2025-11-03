import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, IsInt, Min, IsNotEmpty } from 'class-validator';

export class SetParLevelDto {
  @ApiProperty({
    description: 'The UUID of the menu item to set a par level for.',
    example: 'a1b2c3d4-e5f6-7890-1234-567890abcdef',
    format: 'uuid',
  })
  @IsUUID()
  @IsNotEmpty()
  menu_item_id: string;

  @ApiProperty({
    description: 'The standard quantity to reset the stock to each day. Use 0 to disable.',
    example: 100,
    minimum: 0,
  })
  @IsInt()
  @Min(0)
  @IsNotEmpty()
  par_level: number;
}