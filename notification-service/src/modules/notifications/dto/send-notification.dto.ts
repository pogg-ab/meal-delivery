// notification-service/src/modules/notifications/dto/send-notification.dto.ts

import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class SendNotificationDto {
  @ApiProperty({
    description: 'The FCM registration token of the device to send the notification to.',
    example: 'a-fake-but-valid-device-token-string-for-testing',
  })
  @IsString()
  @IsNotEmpty()
  deviceToken: string;

  @ApiProperty({
    description: 'The title of the push notification.',
    example: 'Single Device Test',
  })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({
    description: 'The body content of the push notification.',
    example: 'This is a test notification for one device.',
  })
  @IsString()
  @IsNotEmpty()
  body: string;
}