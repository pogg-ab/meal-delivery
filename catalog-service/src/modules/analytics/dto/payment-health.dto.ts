import { ApiProperty } from '@nestjs/swagger';

export class PaymentHealthDto {
  @ApiProperty({
    description: 'Total number of successful (PAID) payments across the platform in the last 30 days.',
    example: 8450,
  })
  successfulPayments: number;

  @ApiProperty({
    description: 'Total number of failed payments across the platform in the last 30 days.',
    example: 120,
  })
  failedPayments: number;

  @ApiProperty({
    description: 'The success rate of all payment attempts (successful / total).',
    example: 0.985,
  })
  successRate: number;
}