// PASTE THIS ENTIRE BLOCK INTO: catalog-service/src/app.module.ts

import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { CacheModule } from '@nestjs/cache-manager';
import { redisStore } from 'cache-manager-redis-yet';

import { OrdersModule } from './modules/order/order.module';
import { KafkaProvider } from './providers/kafka.provider';
import { ReportsModule } from './modules/reports/reports.module';
import { SharedModule } from './common/shared/shared.module';
import { RestaurantsModule } from './modules/restaurants/restaurants.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { MenuItemsModule } from './modules/menu-items/menu-items.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { SearchModule } from './modules/search/search.module';
import { PromosModule } from './modules/promos/promo.module';
import { MenuPersonalizationModule } from './modules/menu-personalization/menu-personalization.module';

// --- MERGE RESOLUTION: KEPT BOTH IMPORTS ---
import { RewardsModule } from './modules/rewards/rewards.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({ isGlobal: true }),
    CacheModule.registerAsync({
      isGlobal: true,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => {
        const store = await redisStore({
          socket: {
            host: configService.get('REDIS_HOST', 'localhost'),
            port: parseInt(configService.get('REDIS_PORT', '6379'), 10),
          },
          ttl: 300 * 1000,
        });
        
       
        return {
          store,
        };
      },
    }),
   
   TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => {

        // --- START OF DIAGNOSTIC CODE ---
        const host = cfg.get('POSTGRES_HOST');
        const port = cfg.get<number>('POSTGRES_PORT');
        const username = cfg.get('POSTGRES_USER');
        const database = cfg.get('POSTGRES_DB');

        console.log('\n\n\x1b[31m%s\x1b[0m', '--- [CRITICAL] DATABASE CONNECTION BOOTSTRAP LOG ---');
        console.log(`\x1b[33m  [*] Target Host:     \x1b[0m${host}`);
        console.log(`\x1b[33m  [*] Target Port:     \x1b[0m${port}`);
        console.log(`\x1b[33m  [*] Target Username: \x1b[0m${username}`);
        console.log(`\x1b[33m  [*] Target Database: \x1b[0m${database}`);
        console.log('\x1b[31m%s\x1b[0m', '---------------------------------------------------\n\n');
        // --- END OF DIAGNOSTIC CODE ---

        return {
          type: 'postgres',
          host: host,
          port: port,
          username: username,
          password: cfg.get('POSTGRES_PASSWORD'),
          database: database,
          entities: [__dirname + '/**/*.entity{.ts,.js}'],
          synchronize: false,
          migrationsRun: true,
          migrations: [__dirname + '/migrations/*{.ts,.js}'],
        };
      },
    }),
    ScheduleModule.forRoot(),
     SharedModule,
     RestaurantsModule, 
     CategoriesModule, 
     MenuItemsModule, 
     InventoryModule, 
     OrdersModule, 
     ReportsModule, 
     SearchModule, 
     PromosModule,
     MenuPersonalizationModule,
     // --- MERGE RESOLUTION: KEPT BOTH MODULES ---
     RewardsModule,
     ReviewsModule,
     AnalyticsModule
  ],
  providers: [KafkaProvider],
  exports: [KafkaProvider],
})
export class AppModule {}