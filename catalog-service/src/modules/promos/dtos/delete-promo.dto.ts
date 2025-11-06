import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class DeletePromoCodeDto {
  @ApiPropertyOptional({ description: 'UUID of the promo code. If provided, deletes this specific promo' })
  @IsOptional()
  @IsUUID()
  promoId?: string;

  @ApiPropertyOptional({ description: 'UUID of the restaurant. If provided, deletes all promos issued by this restaurant' })
  @IsOptional()
  @IsUUID()
  restaurantId?: string;
}
