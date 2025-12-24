import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SchedulerService } from './scheduler.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { UserDeviceToken } from '../../entities/user-device-token.entity';

@Module({
  imports: [
    // Provides the HttpService for calling auth-service
    HttpModule,

    // Provides the Repository<UserDeviceToken>
    TypeOrmModule.forFeature([UserDeviceToken]),

    // This module makes the exported 'FirebaseProvider' available for injection
    NotificationsModule,
  ],
  providers: [SchedulerService],
})
export class SchedulerModule {}