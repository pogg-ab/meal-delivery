import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
// import { PlanModule } from './modules/subscription/plan.module';
// import { PlanFeatureModule } from './modules/plan-feature/plan-feature.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        type: "postgres",
        host: cfg.get("POSTGRES_HOST"),
        port: cfg.get<number>("POSTGRES_PORT"),
        username: cfg.get("POSTGRES_USER"),
        password: cfg.get("POSTGRES_PASSWORD"),
        database: cfg.get("POSTGRES_DB"),
        entities: [__dirname + "/**/*.entity{.ts,.js}"],
        synchronize: false,
        migrationsRun: true,
        migrations: [__dirname + "/migrations/*{.ts,.js}"],
      }),
    }),
    // PlanModule,
    // PlanFeatureModule
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
