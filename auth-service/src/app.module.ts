
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from './modules/AuthModule/auth.module';
import { RolesModule } from './modules/RolesModule/roles.module';
import { PermissionsModule } from './modules/PermissionModule/permission.module';
import { AuditModule } from './modules/AuditModule/audit.module';
import { UsersModule } from './modules/UserModule/user.module';
import { KafkaProvider } from './providers/kafka.provider';
import { MailerProvider } from './providers/mailer.provider';
import { RestaurantsModule } from './modules/restaurants/restaurants.module';
import { SharedModule } from './common/shared/shared.module';


@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    // 1) Global throttler + scheduler
   
    ScheduleModule.forRoot(),

    // 2) Database
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject:  [ConfigService],
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
    AuthModule,
    RolesModule,
    PermissionsModule,
    AuditModule,
    UsersModule,
    RestaurantsModule,
    SharedModule
  ],
  providers: [KafkaProvider, MailerProvider],
  exports: [KafkaProvider, MailerProvider],
})
export class AppModule {}
