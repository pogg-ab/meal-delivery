import { ApiProperty } from '@nestjs/swagger';

export class CustomerGrowthDto {
  @ApiProperty({
    description: 'The date for the data point (YYYY-MM-DD format).',
    example: '2023-10-27',
  })
  date: string;

  @ApiProperty({
    description: 'The number of new customers who signed up on that date.',
    example: 15,
  })
  signupCount: number;
}