import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, IsPositive, IsBoolean, IsUrl } from 'class-validator';

export class UpdateMenuItemDto {
  @ApiProperty({ required: false })
  @IsOptional() @IsString()
  name?: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsString()
  description?: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsNumber() @IsPositive()
  price?: number;

  @ApiProperty({ required: false })
  @IsOptional() @IsBoolean()
  is_available?: boolean;

  @ApiProperty({ required: false, example: 'https://res.cloudinary.com/demo/image/upload/v123/menu-item.jpg' })
  @IsOptional() @IsUrl()
  image_url?: string;
}