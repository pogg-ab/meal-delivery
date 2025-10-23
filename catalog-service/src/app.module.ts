import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

// --- ADD THESE IMPORTS FOR REDIS CACHING ---
import { CacheModule } from '@nestjs/cache-manager';
import { redisStore } from 'cache-manager-redis-store';
// -----------------------------------------

// --- Combined Imports ---
import { ScheduleModule } from '@nestjs/schedule';
import { OrdersModule } from './modules/order/order.module';
import { KafkaProvider } from './providers/kafka.provider';
import { ReportsModule } from './modules/reports/reports.module';

// Assuming imports for your other modules are here too
import { SharedModule } from './common/shared/shared.module'; // Or correct path
import { RestaurantsModule } from './modules/restaurants/restaurants.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { MenuItemsModule } from './modules/menu-items/menu-items.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { SearchModule } from './modules/search/search.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    CacheModule.registerAsync({
      isGlobal: true,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => {
        const store = await redisStore({ // <-- THIS IS THE CRITICAL FIX
          url: configService.get<string>('REDIS_URL'),
          ttl: 300,
        });
        return {
          store: () => store,
        };
      },
    }),

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
        migrationsRun: false,
        migrations: [__dirname + '/migrations/*{.ts,.js}'],
      }),
    }),

    // --- Your existing modules ---
    ScheduleModule.forRoot(),
    SharedModule,
    RestaurantsModule,
    CategoriesModule,
    MenuItemsModule,
    InventoryModule,
    OrdersModule,
    ReportsModule,
    SearchModule,
  ],
  providers: [KafkaProvider],
  exports: [KafkaProvider],
})
export class AppModule {}