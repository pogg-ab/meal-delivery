// notification-service/src/modules/notifications/dto/register-device-token.dto.ts

import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class RegisterDeviceTokenDto {
  @ApiProperty({
    description: 'The UUID of the user this device belongs to.',
    example: '11111111-1111-1111-1111-111111111111',
  })
  @IsUUID()
  @IsNotEmpty()
  userId: string;

  @ApiProperty({
    description: 'The FCM registration token from the client device.',
    example: 'a-fake-but-valid-device-token-string-for-testing',
  })
  @IsString()
  @IsNotEmpty()
  deviceToken: string;

  @ApiProperty({
    description: 'The platform of the device.',
    enum: ['web', 'android', 'ios'],
    example: 'web',
  })
  @IsIn(['web', 'android', 'ios'])
  @IsString()
  @IsNotEmpty()
  platform: string;
}