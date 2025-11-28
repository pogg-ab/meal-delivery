// notification-service/src/app.module.ts

import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule'; // <-- 1. IMPORT SCHEDULE MODULE
import { NotificationsModule } from './modules/notifications/notifications.module';
import { UserDeviceToken } from './entities/user-device-token.entity';
import { SchedulerModule } from './modules/scheduler/scheduler.module'; // <-- 2. IMPORT OUR NEW SCHEDULER MODULE
const { SnakeNamingStrategy } = require('typeorm-naming-strategies');

@Module({
  imports: [
    // --- Additions Start Here ---
    ScheduleModule.forRoot(), // <-- 3. ACTIVATE THE SCHEDULING SYSTEM
    // --- Additions End Here ---

    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('POSTGRES_HOST'),
        port: configService.get<number>('POSTGRES_PORT'),
        username: configService.get<string>('POSTGRES_USER'),
        password: configService.get<string>('POSTGRES_PASSWORD'),
        database: configService.get<string>('POSTGRES_DB'),
        entities: [UserDeviceToken],
        namingStrategy: new SnakeNamingStrategy(),
        synchronize: true, 
      }),
    }),
    NotificationsModule,
    SchedulerModule, // <-- 4. REGISTER OUR NEW MODULE
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}