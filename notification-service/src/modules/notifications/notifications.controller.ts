// notification-service/src/modules/notifications/notifications.controller.ts

import { Controller, Post, Body, ValidationPipe, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { NotificationsService } from './notifications.service';
import { RegisterDeviceTokenDto } from './dto/register-device-token.dto';
import { SendNotificationDto } from './dto/send-notification.dto';
import { OrderConfirmedEvent } from './dto/order-confirmed.event';
import { OrderCreatedEvent } from './dto/order-created.event';
import { SendBatchNotificationDto } from './dto/send-batch-notification.dto';
import { OrderPreparingEvent } from './dto/order-preparing.event';
import { OrderReadyEvent } from './dto/order-ready.event';
import { OrderCompletedEvent } from './dto/order-completed.event';
import { OrderCancelledEvent } from './dto/order-cancelled.event';
import { OrderScheduleDueEvent } from './dto/order-schedule-due.event';
import { RewardPointsEarnedEvent } from './dto/reward-points-earned.event';
import { OrderPaidWithPickupEvent } from './dto/order-paid-with-pickup.event';

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

@EventPattern('order.preparing')
  async handleOrderPreparing(@Payload() data: OrderPreparingEvent) {
    this.logger.log(`Received order.preparing event for customer ID: ${data.customer_id}`);
    const tokens = await this.notificationsService.findTokensByUserId(data.customer_id);
    
    // --- UPDATED FOR CONSISTENT LOGGING ---
    if (tokens.length === 0) {
      this.logger.warn(`No device tokens found for customer ID: ${data.customer_id}.`);
      return;
    }
    
    const title = 'Your Order is Being Prepared!';
    const body = `The restaurant has started preparing your order.`;
    for (const token of tokens) {
      await this.notificationsService.sendPushNotification(token.deviceToken, title, body, { orderId: data.order_id });
    }
  }

  @EventPattern('order.ready')
  async handleOrderReady(@Payload() data: OrderReadyEvent) {
    this.logger.log(`Received order.ready event for customer ID: ${data.customer_id}`);
    const tokens = await this.notificationsService.findTokensByUserId(data.customer_id);
    
    // --- UPDATED FOR CONSISTENT LOGGING ---
    if (tokens.length === 0) {
      this.logger.warn(`No device tokens found for customer ID: ${data.customer_id}.`);
      return;
    }
    
    const title = 'Your Order is Ready!';
    const body = `Your order is now ready for pickup.`;
    for (const token of tokens) {
      await this.notificationsService.sendPushNotification(token.deviceToken, title, body, { orderId: data.order_id });
    }
  }

  @EventPattern('order.completed')
  async handleOrderCompleted(@Payload() data: OrderCompletedEvent) {
    this.logger.log(`Received order.completed event for customer ID: ${data.customer_id}`);
    const tokens = await this.notificationsService.findTokensByUserId(data.customer_id);
    
    // --- UPDATED FOR CONSISTENT LOGGING ---
    if (tokens.length === 0) {
      this.logger.warn(`No device tokens found for customer ID: ${data.customer_id}.`);
      return;
    }

    const title = 'Order Completed!';
    const body = `Enjoy your meal! Thank you for ordering with us.`;
    for (const token of tokens) {
      await this.notificationsService.sendPushNotification(token.deviceToken, title, body, { orderId: data.order_id });
    }
  }

  @EventPattern('order.cancelled')
  async handleOrderCancelled(@Payload() data: OrderCancelledEvent) {
    this.logger.log(`Received order.cancelled event for order: ${data.order_id}`);

    // Notify Customer
    const customerTokens = await this.notificationsService.findTokensByUserId(data.customer_id);
    if (customerTokens.length > 0) {
      for (const token of customerTokens) {
        await this.notificationsService.sendPushNotification(token.deviceToken, 'Order Cancelled', 'Your order has been successfully cancelled.', { orderId: data.order_id });
      }
    } else {
      // --- UPDATED FOR CONSISTENT LOGGING ---
      this.logger.warn(`No device tokens found for customer ID: ${data.customer_id}.`);
    }

    // Notify Restaurant Owner
    const ownerTokens = await this.notificationsService.findTokensByUserId(data.owner_id);
    if (ownerTokens.length > 0) {
      for (const token of ownerTokens) {
        await this.notificationsService.sendPushNotification(token.deviceToken, 'Order Cancelled by Customer', 'An order has been cancelled. Please check your dashboard.', { orderId: data.order_id });
      }
    } else {
      // --- UPDATED FOR CONSISTENT LOGGING ---
      this.logger.warn(`No device tokens found for owner ID: ${data.owner_id}.`);
    }
  }

  @EventPattern('order.schedule.due')
async handleOrderScheduleDue(@Payload() data: OrderScheduleDueEvent) {
  this.logger.log(`Received order.schedule.due event for owner ID: ${data.ownerId}`);

  const tokens = await this.notificationsService.findTokensByUserId(data.ownerId);
  if (tokens.length === 0) {
    this.logger.warn(`No device tokens found for owner ID: ${data.ownerId}.`);
    return;
  }

  const title = 'Scheduled Order Is Now Active';
  const body = `The scheduled order for "${data.customerName}" is now due and has been moved to your active orders queue.`;

  for (const token of tokens) {
    await this.notificationsService.sendPushNotification(
      token.deviceToken,
      title,
      body,
      { orderId: data.orderId },
    );
  }
}

@EventPattern('reward.points.earned')
async handleRewardPointsEarned(@Payload() data: RewardPointsEarnedEvent) {
  this.logger.log(`Received reward.points.earned event for customer ID: ${data.customerId}`);

  const tokens = await this.notificationsService.findTokensByUserId(data.customerId);
  if (tokens.length === 0) {
    this.logger.warn(`No device tokens found for customer ID: ${data.customerId}.`);
    return;
  }

  const title = "You've Earned Reward Points!";
  const body = `You received ${data.pointsAwarded} points for your recent order.`;

  for (const token of tokens) {
    await this.notificationsService.sendPushNotification(
      token.deviceToken,
      title,
      body,
      { orderId: data.orderId },
    );
  }
}
@EventPattern('notification.order.paid_with_pickup')
async handleOrderPaid(@Payload() payload: OrderPaidWithPickupEvent) {
  this.logger.log(`Received order paid event with pickup code: ${JSON.stringify(payload)}`);
  return this.notificationsService.handleOrderPaidWithPickup(payload);
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