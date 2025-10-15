// notification-service/src/modules/notifications/notifications.controller.ts

import { Controller, Post, Body, ValidationPipe, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { NotificationsService } from './notifications.service';
import { RegisterDeviceTokenDto } from './dto/register-device-token.dto';
import { SendNotificationDto } from './dto/send-notification.dto';
import { OrderConfirmedEvent } from './dto/order-confirmed.event';
import { OrderCreatedEvent } from './dto/order-created.event';
import { SendBatchNotificationDto } from './dto/send-batch-notification.dto';

// --- Define the shape of the new Kafka event payload ---
class LowStockEvent {
  itemName: string;
  ownerId: string;
  menuItemId: string;
  remainingStock: number;
}

@Controller('notifications')
export class NotificationsController {
  private readonly logger = new Logger(NotificationsController.name);

  constructor(private readonly notificationsService: NotificationsService) {}

  // ====================================================================
  // KAFKA EVENT HANDLERS
  // ====================================================================

  @EventPattern('order.created')
  async handleOrderCreated(@Payload() data: OrderCreatedEvent) {
    this.logger.log(`Received order.created event for owner ID: ${data.ownerId}`);
    
    try {
      // 1. Find all device tokens for the restaurant owner
      const tokens = await this.notificationsService.findTokensByUserId(data.ownerId);

      if (tokens.length === 0) {
        this.logger.warn(`No device tokens found for owner ID: ${data.ownerId}.`);
        return;
      }

      // 2. Prepare the notification message
      const title = 'New Order Received!';
      const body = `You have a new order for ${data.total_amount} ${data.currency}. Please check your dashboard.`;

      // 3. Send a notification to each of the owner's devices
      for (const token of tokens) {
        await this.notificationsService.sendPushNotification(
          token.deviceToken,
          title,
          body,
          { orderId: data.id },
        );
      }
    } catch (error) {
      this.logger.error(
        `An unexpected error occurred while handling order.created for owner ${data.ownerId}.`,
        error.stack,
      );
    }
  }

  @EventPattern('order.confirmed')
  async handleOrderConfirmed(@Payload() data: OrderConfirmedEvent) {
    this.logger.log(`Received order.confirmed event for user ID: ${data.userId}`);
     
    try {
      const tokens = await this.notificationsService.findTokensByUserId(data.userId);

      if (tokens.length === 0) {
        this.logger.warn(`No device tokens found for user ID: ${data.userId}. Cannot send notification.`);
        return;
      }

      const title = 'Order Confirmed!';
      const body = `Your order from ${data.restaurantName} has been confirmed.`;

      for (const token of tokens) {
        await this.notificationsService.sendPushNotification(
          token.deviceToken,
          title,
          body,
          { orderId: String(data.orderId) },
        );
      }
    } catch (error) {
      this.logger.error(
        `An unexpected error occurred while handling order.confirmed for user ${data.userId}.`,
        error.stack,
      );
    }
  }

  @EventPattern('inventory.low_stock')
  async handleInventoryLowStock(@Payload() data: LowStockEvent) {
    this.logger.log(`Received inventory.low_stock event for owner ID: ${data.ownerId}, item: ${data.itemName}`);
    
    try {
      // 1. Find all device tokens for the restaurant owner
      const tokens = await this.notificationsService.findTokensByUserId(data.ownerId);

      if (tokens.length === 0) {
        this.logger.warn(`No device tokens found for owner ID: ${data.ownerId}.`);
        return;
      }

      // 2. Prepare the notification message
      const title = 'Low Stock Alert';
      const body = `Warning: Only ${data.remainingStock} servings of "${data.itemName}" are left!`;

      // 3. Send a notification to each of the owner's devices
      for (const token of tokens) {
        await this.notificationsService.sendPushNotification(
          token.deviceToken,
          title,
          body,
          { menuItemId: data.menuItemId },
        );
      }
    } catch (error) {
      this.logger.error(
        `An unexpected error occurred while handling inventory.low_stock for owner ${data.ownerId}.`,
        error.stack,
      );
    }
  }

  // ====================================================================
  // HTTP ENDPOINTS
  // ====================================================================

  @Post('register-token')
  registerDeviceToken(@Body(new ValidationPipe()) dto: RegisterDeviceTokenDto) {
    return this.notificationsService.registerDeviceToken(dto);
  }

  @Post('send-test')
  async sendTestNotification(
    @Body(new ValidationPipe()) dto: SendNotificationDto,
  ) {
    const { deviceToken, title, body } = dto;
    return this.notificationsService.sendPushNotification(deviceToken, title, body);
  }

  @Post('send-batch')
  sendBatch(@Body(new ValidationPipe()) dto: SendBatchNotificationDto) {
    return this.notificationsService.sendBatchNotification(dto);
  }
}