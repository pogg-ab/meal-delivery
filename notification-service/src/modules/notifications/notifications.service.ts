// notification-service/src/modules/notifications/notifications.service.ts

import {
  Injectable,
  Logger,
  InternalServerErrorException,
  Inject, // <-- Import Inject
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { UserDeviceToken } from '../../entities/user-device-token.entity';
import { RegisterDeviceTokenDto } from './dto/register-device-token.dto';
import * as admin from 'firebase-admin'; // <-- Import firebase-admin
import { SendBatchNotificationDto } from './dto/send-batch-notification.dto';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(UserDeviceToken)
    private readonly deviceTokenRepository: Repository<UserDeviceToken>,

    // Inject the Firebase Admin SDK instance
    @Inject('FIREBASE_ADMIN')
    private readonly firebaseAdmin: admin.app.App,
  ) {}

  async registerDeviceToken(
    dto: RegisterDeviceTokenDto,
  ): Promise<UserDeviceToken> {
    const { userId, deviceToken, platform } = dto;
    // ... (this method remains the same)
    await this.deviceTokenRepository.upsert({ userId, deviceToken, platform }, [
      'deviceToken',
    ]);
    const registeredToken = await this.deviceTokenRepository.findOneBy({
      deviceToken,
    });
    if (!registeredToken) {
      throw new InternalServerErrorException(
        'Failed to confirm token registration.',
      );
    }
    return registeredToken;
  }

  // --- NEW METHOD ---
  async sendPushNotification(
    deviceToken: string,
    title: string,
    body: string,
    data?: { [key: string]: string },
  ) {
    const message: admin.messaging.Message = {
      token: deviceToken,
      notification: {
        title,
        body,
      },
      data: data || {}, // Optional data payload
    };

    try {
      const response = await this.firebaseAdmin.messaging().send(message);
      this.logger.log(`Successfully sent message: ${response}`);
      return { success: true, response };
    } catch (error) {
      this.logger.error(`Failed to send push notification to ${deviceToken}`, error);
      // Here you might want to check for certain errors, e.g., if a token is
      // invalid ('messaging/registration-token-not-registered'), you could
      // remove it from your database.
      return { success: false, error: error.message };
    }
  }

  // This is the NEW, CORRECT code
async findTokensByUserId(userId: string): Promise<UserDeviceToken[]> {
  return this.deviceTokenRepository.find({
    where: { userId },
  });
}

 async sendBatchNotification(dto: SendBatchNotificationDto) {
    const { userIds, title, body } = dto;

    // 1. Find all device tokens for the given user IDs in a single query
    const userDevices = await this.deviceTokenRepository.find({
      where: { userId: In(userIds) },
    });

    const tokens = userDevices.map((device) => device.deviceToken);

    if (tokens.length === 0) {
      this.logger.warn(`No device tokens found for the provided user IDs. Nothing to send.`);
      return { successCount: 0, failureCount: 0, totalTokens: 0 };
    }

    // 2. Chunk tokens into batches of 500 (the FCM limit for sendMulticast)
    const chunkSize = 500;
    const tokenChunks: string[][] = [];
    for (let i = 0; i < tokens.length; i += chunkSize) {
      tokenChunks.push(tokens.slice(i, i + chunkSize));
    }

    this.logger.log(`Sending notification to ${tokens.length} tokens in ${tokenChunks.length} chunk(s).`);

    let totalSuccessCount = 0;
    let totalFailureCount = 0;

    // 3. Send each chunk using sendMulticast
    for (const chunk of tokenChunks) {
      // sendMulticast is not available, so send individually
      let chunkSuccessCount = 0;
      let chunkFailureCount = 0;

      for (const token of chunk) {
        const message: admin.messaging.Message = {
          token,
          notification: { title, body },
        };
        try {
          await this.firebaseAdmin.messaging().send(message);
          chunkSuccessCount++;
        } catch (error) {
          chunkFailureCount++;
          this.logger.error(
            `Failed to send to token ${token}: ${error?.message}`,
          );
          // Optional: Here you could add logic to delete invalid tokens
        }
      }

      totalSuccessCount += chunkSuccessCount;
      totalFailureCount += chunkFailureCount;
    }
    
    this.logger.log(`Batch send complete. Success: ${totalSuccessCount}, Failure: ${totalFailureCount}`);
    
    return {
      successCount: totalSuccessCount,
      failureCount: totalFailureCount,
      totalTokens: tokens.length,
    };
  }
}