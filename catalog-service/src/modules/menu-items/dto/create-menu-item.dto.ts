import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID, IsOptional, IsNumber, IsPositive, IsBoolean } from 'class-validator';

export class CreateMenuItemDto {
  @ApiProperty({ description: 'The ID of the category this item belongs to' })
  @IsUUID()
  @IsNotEmpty()
  category_id: string;

  @ApiProperty({ example: 'Doro Wat' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'A spicy traditional chicken stew.', required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 250.00 })
  @IsNumber()
  @IsPositive()
  price: number;

  @ApiProperty({ description: 'Manually set if the item is available, ignoring stock. Defaults to true.', required: false })
  @IsOptional()
  @IsBoolean()
  is_available?: boolean;
}