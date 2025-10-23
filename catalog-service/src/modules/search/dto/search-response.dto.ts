import { ApiProperty } from '@nestjs/swagger';

export class SearchResultItem {
  @ApiProperty({
    description: 'The type of the result, either "restaurant" or "food"',
    example: 'restaurant',
  })
  result_type: 'restaurant' | 'food';

  @ApiProperty({
    description: 'The unique identifier of the item',
    example: 'a1b2c3d4-e5f6-g7h8-i9j0-k1l2m3n4o5p6',
  })
  id: string;

  @ApiProperty({
    description: 'The name of the restaurant or food item',
    example: 'Gourmet Burger Kitchen',
  })
  name: string;

  @ApiProperty({
    description: 'For restaurants: the address. For food: the restaurant name.',
    example: '123 Flavor Town Ave',
  })
  detail_one: string;

  @ApiProperty({
    description: 'For restaurants: average price. For food: item price.',
    example: '15.50',
  })
  detail_two: string;

  @ApiProperty({
    description: "The rating of the restaurant (food items inherit their restaurant's rating)",
    example: 4.8,
  })
  rating: number;
}

export class SearchResponseDto {
  @ApiProperty({
    description: 'The original search query string',
    example: 'burger',
  })
  query: string;

  @ApiProperty({
    type: [SearchResultItem],
    description: 'The list of search results',
  })
  results: SearchResultItem[];
}