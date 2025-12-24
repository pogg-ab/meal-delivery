import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource } from 'typeorm';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(private readonly dataSource: DataSource) {}

  @Cron(CronExpression.EVERY_DAY_AT_2AM, {
    name: 'refresh_materialized_views',
    timeZone: 'Etc/UTC', // Use a specific timezone, e.g., UTC
  })
  async handleRefreshMaterializedViews() {
    this.logger.log('Starting scheduled job: Refreshing materialized views...');
    try {
      // REFRESH CONCURRENTLY allows reads while the view is being updated, preventing downtime.
      await this.dataSource.query('REFRESH MATERIALIZED VIEW CONCURRENTLY mv_daily_restaurant_revenue;');
      this.logger.log('Successfully refreshed mv_daily_restaurant_revenue.');
    } catch (error) {
      this.logger.error('Failed to refresh materialized views', error.stack);
    }
  }
}