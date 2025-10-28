// src/modules/restaurants/dto/restaurant-profile.dto.ts

import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

// CORRECTED IMPORT PATHS
import { RestaurantStatus } from '../../../entities/restaurant.entity';
import { Address } from '../../../entities/address.entity';
import { RestaurantHour } from '../../../entities/restaurant-hour.entity';
import { RestaurantDocument } from '../../../entities/restaurant-document.entity';
import { RestaurantBankDetail } from '../../../entities/restaurant-bank-detail.entity';

export class RestaurantProfileDto {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  name: string;

  @ApiProperty()
  @Expose()
  description: string;

  @ApiProperty()
  @Expose()
  email: string;

  @ApiProperty()
  @Expose()
  phone: string;

  @ApiProperty({ enum: RestaurantStatus })
  @Expose()
  status: RestaurantStatus;

  @ApiProperty()
  @Expose()
  is_active: boolean;

  @ApiProperty({ nullable: true })
  @Expose()
  rejection_reason: string;
  
  @ApiProperty()
  @Expose()
  average_rating: number;

  @ApiProperty()
  @Expose()
  ratings_count: number;

  @ApiProperty({ type: () => Address })
  @Expose()
  @Type(() => Address)
  addresses: Address[];

  @ApiProperty({ type: () => RestaurantHour })
  @Expose()
  @Type(() => RestaurantHour)
  hours: RestaurantHour[];

  @ApiProperty({ type: () => RestaurantDocument })
  @Expose()
  @Type(() => RestaurantDocument)
  documents: RestaurantDocument[];

  @ApiProperty({ type: () => RestaurantBankDetail })
  @Expose()
  @Type(() => RestaurantBankDetail)
  bank_details: RestaurantBankDetail[];
}
