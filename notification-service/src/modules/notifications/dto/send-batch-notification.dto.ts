// notification-service/src/modules/notifications/dto/send-batch-notification.dto.ts

import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsNotEmpty,
  IsString,
  IsUUID,
  ArrayNotEmpty,
} from 'class-validator';

export class SendBatchNotificationDto {
  @ApiProperty({
    description: 'An array of user UUIDs to send the notification to.',
    example: [
      '11111111-1111-1111-1111-111111111111',
      '22222222-2222-2222-2222-222222222222',
    ],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true, message: 'Each userId must be a valid UUID' })
  userIds: string[];

  @ApiProperty({
    description: 'The title of the push notification.',
    example: 'Batch Notification Test',
  })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({
    description: 'The body content of the push notification.',
    example: 'This message is for multiple users.',
  })
  @IsString()
  @IsNotEmpty()
  body: string;
}