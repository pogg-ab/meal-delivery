// src/modules/analytics/dto/top-customer.dto.ts

import { ApiProperty } from '@nestjs/swagger';

export class TopCustomerDto {
  @ApiProperty({ description: 'The UUID of the customer.' })
  customerId: string;

  @ApiProperty({ description: "The customer's name at the time of their last order.", example: 'Jane Smith' })
  customerName: string;

  @ApiProperty({ description: 'Total number of completed orders by this customer in the last 30 days.', example: 12 })
  orderCount: number;
}