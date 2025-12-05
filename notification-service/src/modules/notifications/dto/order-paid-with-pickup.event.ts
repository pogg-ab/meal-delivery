import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class OrderPaidWithPickupEvent {
  @IsUUID()
  customerId: string;

  @IsUUID()
  orderId: string;

  @IsString()
  @IsNotEmpty()
  pickupCode: string;

  @IsString()
  @IsNotEmpty()
  restaurantName: string;
}