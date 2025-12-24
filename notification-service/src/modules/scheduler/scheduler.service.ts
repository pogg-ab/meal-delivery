import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { UserDeviceToken } from '../../entities/user-device-token.entity';
import * as admin from 'firebase-admin';

// A simple interface to represent the user data we expect from auth-service
interface CustomerUser {
  id: string; // We only need the ID
}

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private readonly httpService: HttpService,
    
    // We inject the dependencies DIRECTLY, making this service self-contained
    @InjectRepository(UserDeviceToken)
    private readonly deviceTokenRepository: Repository<UserDeviceToken>,

    @Inject('FIREBASE_ADMIN')
    private readonly firebaseAdmin: admin.app.App,
  ) {}

  /**
   * Runs every day at 11:30 AM server time.
   */
   @Cron('30 11 * * *', { 
    name: 'lunch_notifications',
    timeZone: 'Africa/Addis_Ababa', 
  })
  async handleLunchtimeNotifications() {
    this.logger.log('Executing Lunchtime Promotional Notifications Cron Job...');
    
    const message = {
      title: "It's almost lunchtime! 🌮",
      body: "Feeling hungry? Tap to see today's best lunch deals near you.",
    };

    await this.sendPromotionalNotifications(message);
    this.logger.log('Lunchtime notification job completed.');
  }

  /**
   * Runs every day at 6:00 PM (18:00) server time.
   */
  @Cron(CronExpression.EVERY_DAY_AT_6PM, { 
    name: 'dinner_notifications',
    timeZone: 'Africa/Addis_Ababa', 
  })
  async handleDinnertimeNotifications() {
    this.logger.log('Executing Dinner Promotional Notifications Cron Job...');
    
    const message = {
      title: 'Dinner is served! 🍝',
      body: "Don't cook tonight. Discover delicious dinner options and get them delivered fast.",
    };

    await this.sendPromotionalNotifications(message);
    this.logger.log('Dinner notification job completed.');
  }
  
  /**
   * This is the core logic, now fully independent within this service.
   */
  private async sendPromotionalNotifications(message: { title: string, body: string }) {
    try {
      // 1. Fetch all customer user IDs from the auth-service
      const userIds = await this.fetchAllCustomerIds();
      if (userIds.length === 0) {
        this.logger.warn('No customer users found to notify. Job finished.');
        return;
      }
      this.logger.log(`Customer IDs fetched from auth-service: ${JSON.stringify(userIds)}`);
      this.logger.log(`Found ${userIds.length} customers to notify.`);

      // 2. Find all device tokens for those user IDs from our own database
      const userDevices = await this.deviceTokenRepository.find({
        where: { userId: In(userIds) },
      });
      const tokens = userDevices.map((device) => device.deviceToken);

      if (tokens.length === 0) {
        this.logger.warn('No device tokens found for the fetched user IDs.');
        return;
      }

      // 3. Send notifications directly using the Firebase Admin SDK
      // (This logic is safely copied from your existing service)
      this.logger.log(`Sending promotional message to ${tokens.length} total device tokens.`);
      let successCount = 0;
      let failureCount = 0;

      for (const token of tokens) {
        const firebaseMessage: admin.messaging.Message = {
          token,
          notification: { title: message.title, body: message.body },
        };
        try {
          await this.firebaseAdmin.messaging().send(firebaseMessage);
          successCount++;
        } catch (error) {
          failureCount++;
          this.logger.error(`Failed to send promo to token ${token}: ${error?.message}`);
        }
      }

      this.logger.log(`Promotional batch send complete. Success: ${successCount}, Failure: ${failureCount}`);

    } catch (error) {
      this.logger.error('A critical error occurred in the promotional notification job', error.stack);
    }
  }

  private async fetchAllCustomerIds(): Promise<string[]> {
    try {
      const authServiceUrl = 'https://mealsystem.basirahtv.com/auth/users/internal/customers';
      const response = await firstValueFrom(
        this.httpService.get<CustomerUser[]>(authServiceUrl),
      );
      return response.data.map(user => user.id);
    } catch (error) {
      this.logger.error('CRITICAL: Failed to fetch customer list from auth-service.', error.stack);
      return [];
    }
  }
}