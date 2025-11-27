// auth-service/src/modules/analytics/analytics.module.ts
import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AuthModule } from '../AuthModule/auth.module';

@Module({
  imports: [AuthModule], // Import AuthModule to get access to AuthService
  controllers: [AnalyticsController],
})
export class AnalyticsModule {}