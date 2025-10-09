// notification-service/src/modules/notifications/notifications.controller.ts

import { Controller, Post, Body, ValidationPipe, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { NotificationsService } from './notifications.service';
import { RegisterDeviceTokenDto } from './dto/register-device-token.dto';
import { SendNotificationDto } from './dto/send-notification.dto';
import { OrderConfirmedEvent } from './dto/order-confirmed.event';
import { OrderCreatedEvent } from './dto/order-created.event';
import { SendBatchNotificationDto } from './dto/send-batch-notification.dto';

@Controller('notifications')
export class NotificationsController {
  private readonly logger = new Logger(NotificationsController.name);

  constructor(private readonly notificationsService: NotificationsService) {}


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

  // --- KAFKA EVENT HANDLER ---
 @EventPattern('order.confirmed')
async handleOrderConfirmed(@Payload() data: OrderConfirmedEvent) {
  this.logger.log(`Received order.confirmed event for user ID: ${data.userId}`);
  
  // --- START OF FIX ---
  try {
    const tokens = await this.notificationsService.findTokensByUserId(data.userId);

    if (tokens.length === 0) {
      this.logger.warn(`No device tokens found for user ID: ${data.userId}. Cannot send notification.`);
      return; // This is a normal case, not an error.
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
    // Catch any unexpected errors (like database connection issues)
    // and log them without crashing the consumer.
    this.logger.error(
      `An unexpected error occurred while handling order.confirmed for user ${data.userId}.`,
      error.stack,
    );
  }
  // --- END OF FIX ---
}

  // --- HTTP ENDPOINTS (remain the same) ---
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
    // We delegate the complex logic entirely to the service
    return this.notificationsService.sendBatchNotification(dto);
  }
}