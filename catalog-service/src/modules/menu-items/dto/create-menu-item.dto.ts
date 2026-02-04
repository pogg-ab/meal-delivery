import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID, IsOptional, IsNumber, IsPositive, IsUrl } from 'class-validator';

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

  @ApiProperty({ example: 'https://res.cloudinary.com/demo/image/upload/v123/menu-item.jpg', required: false })
  @IsOptional()
  @IsUrl()
  image_url?: string;


}