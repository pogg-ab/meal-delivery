import { IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class DeleteAllCustomersDto {
  @ApiProperty({
    description: 'Confirm the mass delete operation. Must be true to proceed.',
    example: true,
  })
  @IsBoolean()
  confirm: boolean;
}
