// in inventory-service/src/inventory.consumer.ts

import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { InventoryService } from './inventory.service';

interface OrderItemPayload {
  menuItemId: string;
  quantity: number;
}

// ▼▼▼ CHANGE #1: UPDATE THE INTERFACE NAME AND ORDER ID PROPERTY ▼▼▼
interface OrderCompletedPayload {
  order_id: string; // The property name from the event is 'order_id'
  items: OrderItemPayload[];
}
// ▲▲▲ END OF CHANGE #1 ▲▲▲

@Controller()
export class InventoryConsumer {
  private readonly logger = new Logger(InventoryConsumer.name);

  constructor(private readonly inventoryService: InventoryService) {}

  // ▼▼▼ CHANGE #2: UPDATE THE EVENT PATTERN AND METHOD ▼▼▼
  @EventPattern('order.completed') // <-- WAS 'order.confirmed'
  async handleOrderCompleted(@Payload() data: OrderCompletedPayload) {
    // Note the use of data.order_id to match the payload interface
    this.logger.log(`Received order.completed event for order ID: ${data.order_id}`);
    try {
      // The core logic call is UNCHANGED
      await this.inventoryService.deductStockForOrder(data.items);
      this.logger.log(`Successfully deducted stock for order ${data.order_id}`);
    } catch (error) {
      this.logger.error(
        `Failed to process stock deduction for order ${data.order_id}. The event will be skipped.`,
        error.stack,
      );
    }
  }
  // ▲▲▲ END OF CHANGE #2 ▲▲▲
}