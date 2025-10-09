import { Controller, Logger } from '@nestjs/common'; 
import { EventPattern, Payload } from '@nestjs/microservices';
import { InventoryService } from './inventory.service';

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
  private readonly logger = new Logger(InventoryConsumer.name);

  constructor(private readonly inventoryService: InventoryService) {}

  @EventPattern('order.confirmed')
  async handleOrderConfirmed(@Payload() data: OrderConfirmedPayload) {
    this.logger.log(`Received order.confirmed event for order ID: ${data.orderId}`);
    try {
      await this.inventoryService.deductStockForOrder(data.items);
      this.logger.log(`Successfully deducted stock for order ${data.orderId}`);
    } catch (error) {
      this.logger.error(
        `Failed to process stock deduction for order ${data.orderId}. The event will be skipped.`,
        error.stack,
      );
    }
  }
}