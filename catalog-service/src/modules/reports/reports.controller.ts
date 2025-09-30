// src/modules/reports/reports.controller.ts
import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { OrderReportQueryDto } from './dto/order-report-query.dto';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('inventory/low-stock/:restaurantId')
  async getLowStockReport(
    @Param('restaurantId', ParseUUIDPipe) restaurantId: string,
  ) {
    return this.reportsService.getLowStockReport(restaurantId);
  }

  @Get('orders/restaurant/:restaurantId')
  async getOrderReport(
    @Param('restaurantId', ParseUUIDPipe) restaurantId: string,
    @Query() query: OrderReportQueryDto,
  ) {
    return this.reportsService.getOrderReport(restaurantId, query.period);
  }
}