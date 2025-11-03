// import { ApiProperty } from '@nestjs/swagger';
// import { IsArray, ValidateNested, IsUUID, IsNumber, IsOptional, Min } from 'class-validator';
// import { Type } from 'class-transformer';

// class CreateOrderItemDto {
//   @ApiProperty()
//   @IsUUID()
//   menu_item_id: string;

//   @ApiProperty({ required: false })
//   @IsNumber()
//   @IsOptional()
//   @Min(1)
//   quantity?: number;

//   @ApiProperty({ required: false })
//   @IsOptional()
//   instructions?: string;
// }

// export class CreateOrderDto {
//   @ApiProperty({ type: [CreateOrderItemDto] })
//   @IsArray()
//   @ValidateNested({ each: true })
//   @Type(() => CreateOrderItemDto)
//   items: CreateOrderItemDto[];

//   @ApiProperty({ required: true })
//   @IsUUID()
//   restaurant_id: string;

//   @ApiProperty({ required: false })
//   @IsOptional()
//   instructions?: string;

//   @ApiProperty({ required: false, example: 'USD' })
//   @IsOptional()
//   currency?: string;

//   @ApiProperty({ required: false })
//   @IsOptional()
//   is_delivery?: boolean;
// }


// src/modules/orders/dtos/create-order.dto.ts (updated)
import { ApiProperty } from '@nestjs/swagger';
import { IsArray, ValidateNested, IsUUID, IsNumber, IsOptional, Min, IsString } from 'class-validator';
import { Type } from 'class-transformer';


class CreateOrderItemDto {
@ApiProperty()
@IsUUID()
menu_item_id: string;


@ApiProperty({ required: false })
@IsNumber()
@IsOptional()
@Min(1)
quantity?: number;


@ApiProperty({ required: false })
@IsOptional()
instructions?: string;
}


export class CreateOrderDto {
@ApiProperty({ type: [CreateOrderItemDto] })
@IsArray()
@ValidateNested({ each: true })
@Type(() => CreateOrderItemDto)
items: CreateOrderItemDto[];


@ApiProperty({ required: true })
@IsUUID()
restaurant_id: string;


@ApiProperty({ required: false })
@IsOptional()
instructions?: string;


@ApiProperty({ required: false, example: 'USD' })
@IsOptional()
currency?: string;


@ApiProperty({ required: false })
@IsOptional()
is_delivery?: boolean;


@ApiProperty({ required: false, description: 'Promo code to apply' })
@IsOptional()
@IsString()
promo_code?: string;
}
