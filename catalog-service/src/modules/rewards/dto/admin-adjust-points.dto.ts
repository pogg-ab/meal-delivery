// src/modules/rewards/dto/admin-adjust-points.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsString, IsUUID, NotEquals } from 'class-validator';

export class AdminAdjustPointsDto {
  @ApiProperty({
    description: 'The UUID of the customer whose balance will be adjusted.',
    example: 'a1b2c3d4-e5f6-7890-1234-567890abcdef',
  })
  @IsUUID()
  customer_id: string;

  @ApiProperty({
    description: 'The number of points to add (positive) or remove (negative). Cannot be zero.',
    example: -50,
  })
  @IsInt()
  @NotEquals(0, { message: 'Points must be a non-zero integer.' })
  points: number;

  @ApiProperty({
    description: 'A mandatory reason for the adjustment, for auditing purposes.',
    example: 'Goodwill gesture for delayed order #xyz.',
  })
  @IsString()
  @IsNotEmpty({ message: 'A reason for the adjustment is required.' })
  reason: string;
}