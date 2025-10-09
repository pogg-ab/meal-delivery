// notification-service/src/app.module.ts

import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { UserDeviceToken } from './entities/user-device-token.entity';
const { SnakeNamingStrategy } = require('typeorm-naming-strategies');

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('POSTG-RES_HOST'),
        port: configService.get<number>('POSTGRES_PORT'),
        username: configService.get<string>('POSTGRES_USER'),
        password: configService.get<string>('POSTGRES_PASSWORD'),
        database: configService.get<string>('POSTGRES_DB'),
        entities: [UserDeviceToken],
        namingStrategy: new SnakeNamingStrategy(),
        
        // --- THIS IS THE KEY CHANGE ---
        // It automatically creates/updates tables to match your entities.
        synchronize: true, 
      }),
    }),
    NotificationsModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}