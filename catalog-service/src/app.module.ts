// in catalog-service/src/app.module.ts

import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { CacheModule } from '@nestjs/cache-manager';
import { redisStore } from 'cache-manager-redis-yet'; // The new, correct library

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
import { ReviewsModule } from './modules/reviews/reviews.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    
    // --- THIS IS THE FINAL, CORRECTED REDIS CONFIGURATION ---
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
        
        // The definitive fix: Return the created store instance directly.
        return {
          store,
        };
      },
    }),
    // ---------------------------------------------------------

    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        type: 'postgres',
        host: cfg.get('POSTGRES_HOST'),
        port: cfg.get<number>('POSTGRES_PORT'),
        username: cfg.get('POSTGRES_USER'),
        password: cfg.get('POSTGRES_PASSWORD'),
        database: cfg.get('POSTGRES_DB'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        synchronize: false,
        migrationsRun: true,
        migrations: [__dirname + '/migrations/*{.ts,.js}'],
      }),
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
     ReviewsModule
  ],
  providers: [KafkaProvider],
  exports: [KafkaProvider],
})
export class AppModule {}