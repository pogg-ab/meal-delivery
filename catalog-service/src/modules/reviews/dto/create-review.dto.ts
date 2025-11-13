import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsUUID, IsInt, Min, Max, IsString, IsOptional, MaxLength } from 'class-validator';

export class CreateReviewDto {
  @ApiProperty({ 
    description: 'The ID of the menu item being reviewed',
    example: '123e4567-e89b-12d3-a456-426614174000'
  })
  @IsUUID()
  @IsNotEmpty()
  menu_item_id: string;

  @ApiProperty({ 
    description: 'Rating from 1 to 5 stars',
    example: 5,
    minimum: 1,
    maximum: 5
  })
  @IsInt()
  @Min(1)
  @Max(5)
  @IsNotEmpty()
  rating: number;

  @ApiProperty({ 
    description: 'Optional review comment',
    example: 'Absolutely delicious! The flavors were amazing.',
    required: false,
    maxLength: 2000
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;

  @ApiProperty({ 
    description: 'Order ID if this review is for a purchased item',
    example: '123e4567-e89b-12d3-a456-426614174001',
    required: false
  })
  @IsOptional()
  @IsUUID()
  order_id?: string;
}
