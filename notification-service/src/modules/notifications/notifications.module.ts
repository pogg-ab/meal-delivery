
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { UserDeviceToken } from '../../entities/user-device-token.entity';
import { FirebaseProvider } from './firebase.provider'; 

@Module({
  imports: [TypeOrmModule.forFeature([UserDeviceToken])],
  controllers: [NotificationsController],
  providers: [
    FirebaseProvider, 
    NotificationsService,
  ],
  exports: [
    FirebaseProvider,
  ],
})
export class NotificationsModule {}