// src/modules/reports/reports.controller.ts
import { Controller, Get, Param, ParseUUIDPipe, Post, Query, Res } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { OrderReportQueryDto } from './dto/order-report-query.dto';
import { ApiOkResponse, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { StockMovementQueryDto } from './dto/stock-movement-query.dto';
import { SalesSummaryQueryDto } from './dto/sales-summary-query.dto';
import { OrderListQueryDto } from './dto/order-list-query.dto';
import { unparse } from 'papaparse';
import { Response as ExpressResponse } from 'express';

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

  @Get('orders/:restaurantId')
@ApiOperation({ summary: 'Get a list of orders within a date range, with an optional status filter' })
@ApiParam({ name: 'restaurantId', description: 'Restaurant UUID' })
@ApiOkResponse({
  description: 'A list of orders matching the criteria.',
})
async getOrderListReport(
  @Param('restaurantId', ParseUUIDPipe) restaurantId: string,
  @Query() query: OrderListQueryDto,
) {
  return this.reportsService.getOrderListReport(restaurantId, query);
}
  @Post('inventory/generate-snapshot')
  @ApiOperation({ summary: '[TESTING ONLY] Manually trigger yesterday\'s inventory snapshot' })
  async triggerSnapshot() {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    
    const startOfYesterday = new Date(yesterday.setHours(0, 0, 0, 0));
    const endOfYesterday = new Date(yesterday.setHours(23, 59, 59, 999));

    await this.reportsService.generateSnapshotForDate(startOfYesterday, endOfYesterday);
    return {
      message: 'Snapshot generation for yesterday has been triggered successfully.',
      date: startOfYesterday.toISOString().split('T')[0]
    };
  }
  @Get('inventory/movement/:restaurantId')
@ApiOperation({ summary: 'Get daily stock movement for a restaurant' })
@ApiParam({ name: 'restaurantId', description: 'Restaurant UUID' })
@ApiQuery({ name: 'date', description: 'Date in YYYY-MM-DD format', type: String })
@ApiOkResponse({
  description: 'A list of menu items with their stock movements for the given day.',
})
async getStockMovementReport(
  @Param('restaurantId', ParseUUIDPipe) restaurantId: string,
  @Query() query: StockMovementQueryDto,
) {
  return this.reportsService.getStockMovementReport(restaurantId, query.date);
}
@Get('sales/summary/:restaurantId')
@ApiOperation({ summary: 'Get a sales summary (orders and revenue) for a date range' })
@ApiParam({ name: 'restaurantId', description: 'Restaurant UUID' })
@ApiOkResponse({
  description: 'An object containing the total orders and total revenue for the period.',
})
async getSalesSummaryReport(
  @Param('restaurantId', ParseUUIDPipe) restaurantId: string,
  @Query() query: SalesSummaryQueryDto,
) {
  return this.reportsService.getSalesSummaryReport(
    restaurantId,
    query.startDate,
    query.endDate,
  );
}

  @Get('sales/top-items/:restaurantId')
  @ApiOperation({ summary: 'Get a list of top selling menu items for a date range' })
  @ApiParam({ name: 'restaurantId', description: 'Restaurant UUID' })
  @ApiOkResponse({
    description: 'A ranked list of menu items by revenue, in either JSON or CSV format.',
  })
  async getTopSellingItemsReport(
    @Param('restaurantId', ParseUUIDPipe) restaurantId: string,
    @Query() query: SalesSummaryQueryDto,
    @Res() res: ExpressResponse, // <-- Use @Res() and the correct type 'ExpressResponse'
  ) {
    const data = await this.reportsService.getTopSellingItemsReport(
      restaurantId,
      query.startDate,
      query.endDate,
    );

    if (query.format === 'csv') {
      if (data.length === 0) {
        // When using @Res, you must handle the response manually
        res.status(200).send('No data available for the selected period.');
        return;
      }
      
     const csv = unparse(data);

      res.header('Content-Type', 'text/csv');
      res.header('Content-Disposition', `attachment; filename="top-selling-items-${query.startDate}-to-${query.endDate}.csv"`);
      
      res.send(csv);
    } else {
      // For JSON, let NestJS handle it unless you need custom logic, or send manually
      res.json(data);
    }
  }
}