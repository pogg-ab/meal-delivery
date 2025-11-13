import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsInt, Min, Max, IsString, IsOptional, MaxLength } from 'class-validator';

export class UpdateReviewDto {
  @ApiProperty({ 
    description: 'Rating from 1 to 5 stars',
    example: 4,
    minimum: 1,
    maximum: 5,
    required: false
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @ApiProperty({ 
    description: 'Optional review comment',
    example: 'Updated: Still great, but slightly less spicy than I remembered.',
    required: false,
    maxLength: 2000
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}
