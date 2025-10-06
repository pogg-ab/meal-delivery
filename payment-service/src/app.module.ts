import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService} from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { KafkaProvider } from './providers/kafka.provider';
import { PaymentsModule } from './modules/payment/payment.module';


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
        migrationsRun: true,
        migrations: [__dirname + '/migrations/*{.ts,.js}'],
      }),
    }),

    // --- Combined Modules ---
    // ScheduleModule.forRoot(), // From the right side
    // SharedModule,
    // RestaurantsModule,
    // CategoriesModule, // For the /categories endpoints
    // MenuItemsModule, // For the /menu-items endpoints
    // InventoryModule, // For the /inventory endpoints and consumer
    // OrdersModule,
    // ReportsModule, // From the left side
    PaymentsModule
  ],
  controllers: [AppController],
  providers: [KafkaProvider, AppService],
})
export class AppModule {}
