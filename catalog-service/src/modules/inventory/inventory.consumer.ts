import { Controller } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { InventoryService } from './inventory.service';

// This defines the "contract" for the event payload
interface OrderItemPayload {
  menuItemId: string;
  quantity: number;
}

interface OrderConfirmedPayload {
  orderId: string;
  items: OrderItemPayload[];
}

@Controller()
export class InventoryConsumer {
  constructor(private readonly inventoryService: InventoryService) {}

  @EventPattern('order.confirmed')
  async handleOrderConfirmed(@Payload() data: OrderConfirmedPayload) {
    console.log(`Received order.confirmed event for order ID: ${data.orderId}`);
    await this.inventoryService.deductStockForOrder(data.items);
  }
}