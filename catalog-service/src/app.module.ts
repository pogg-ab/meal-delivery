import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

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

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
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

    // --- Combined Modules ---
    ScheduleModule.forRoot(), // From the right side
    SharedModule,
    RestaurantsModule,
    CategoriesModule, // For the /categories endpoints
    MenuItemsModule, // For the /menu-items endpoints
    InventoryModule, // For the /inventory endpoints and consumer
    OrdersModule,
    ReportsModule, // From the left side
  ],
  providers: [KafkaProvider],
  exports: [KafkaProvider],
})
export class AppModule {}