// src/modules/promos/dtos/create-promo.dto.ts
// import { ApiProperty } from '@nestjs/swagger';
// import { IsString, IsIn, IsOptional, IsNumber, Min, Max, IsUUID, IsInt } from 'class-validator';

// export class CreatePromoDto {
//   @ApiProperty({ required: false, description: 'Optional code. If omitted, server will generate one.' })
//   @IsOptional()
//   @IsString()
//   code?: string;

//   @ApiProperty({ enum: ['percentage', 'fixed'] })
//   @IsString()
//   @IsIn(['percentage', 'fixed'])
//   discount_type: 'percentage' | 'fixed';

//   @ApiProperty({ description: 'Percentage (e.g. 10) or fixed amount (e.g. 100).', type: Number })
//   @IsNumber()
//   discount_value: number;

//   @ApiProperty({ enum: ['restaurant', 'platform', 'shared'] })
//   @IsString()
//   @IsIn(['restaurant', 'platform', 'shared'])
//   issuer_type: 'restaurant' | 'platform' | 'shared';

//   @ApiProperty({ description: 'If issuer_type=restaurant this must be set (restaurant UUID)', required: false })
//   @IsOptional()
//   @IsUUID()
//   applicable_restaurant_id?: string;

//   @ApiProperty({ description: 'When shared: percent of discount covered by restaurant (0..100).', required: false, example: 50 })
//   @IsOptional()
//   @IsInt()
//   @Min(0)
//   @Max(100)
//   restaurant_share_percent?: number;

//   @ApiProperty({ required: false })
//   @IsOptional()
//   @IsInt()
//   @Min(1)
//   max_uses?: number;

//   @ApiProperty({ required: false })
//   @IsOptional()
//   expiry_date?: string; // ISO date string

//   @ApiProperty({ required: false })
//   @IsOptional()
//   active?: boolean;
// }



// src/modules/promos/dtos/create-promo.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsIn, IsOptional, IsNumber, Min, Max, IsUUID, IsInt } from 'class-validator';


export class CreatePromoDto {
@ApiProperty({ required: false })
@IsOptional()
@IsString()
code?: string;


@ApiProperty({ enum: ['percentage', 'fixed'] })
@IsString()
@IsIn(['percentage', 'fixed'])
discount_type: 'percentage' | 'fixed';


@ApiProperty()
@IsNumber()
discount_value: number;


@ApiProperty({ enum: ['restaurant', 'platform', 'shared'] })
@IsString()
@IsIn(['restaurant', 'platform', 'shared'])
issuer_type: 'restaurant' | 'platform' | 'shared';


@ApiProperty({ required: false })
@IsOptional()
@IsUUID()
applicable_restaurant_id?: string;


@ApiProperty({ required: false })
@IsOptional()
@IsInt()
@Min(0)
@Max(100)
restaurant_share_percent?: number;


@ApiProperty({ required: false })
@IsOptional()
@IsInt()
@Min(1)
max_uses?: number;


@ApiProperty({ required: false })
@IsOptional()
expiry_date?: string;


@ApiProperty({ required: false })
@IsOptional()
active?: boolean;
}