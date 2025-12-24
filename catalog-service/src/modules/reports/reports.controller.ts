import { Controller, Get, Param, ParseUUIDPipe, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOkResponse, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { UserId } from 'src/common/decorator/user-id.decorator';
import { ReportsService } from './reports.service';
import { OrderReportQueryDto } from './dto/order-report-query.dto';
import { StockMovementQueryDto } from './dto/stock-movement-query.dto';
import { SalesSummaryQueryDto } from './dto/sales-summary-query.dto';
import { OrderListQueryDto } from './dto/order-list-query.dto';
import { unparse } from 'papaparse';
import { Response as ExpressResponse } from 'express';

@ApiTags('Reports')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('inventory/low-stock/:restaurantId')
  @ApiOperation({ summary: 'Get a list of items with low stock (owner only)' })
  @ApiParam({ name: 'restaurantId', description: 'Restaurant UUID' })
  @ApiOkResponse({ description: 'A list of low-stock inventory items.' })
  async getLowStockReport(
    @Param('restaurantId', ParseUUIDPipe) restaurantId: string,
    @UserId() ownerId: string,
  ) {
    return this.reportsService.getLowStockReport(restaurantId, ownerId);
  }

  @Get('orders/restaurant/:restaurantId')
  @ApiOperation({ summary: 'Get a quick order report for a specific period (owner only)' })
  @ApiParam({ name: 'restaurantId', description: 'Restaurant UUID' })
  @ApiOkResponse({ description: 'A summary of orders and revenue for the period.' })
  async getOrderReport(
    @Param('restaurantId', ParseUUIDPipe) restaurantId: string,
    @Query() query: OrderReportQueryDto,
    @UserId() ownerId: string,
  ) {
    return this.reportsService.getOrderReport(restaurantId, query.period, ownerId);
  }

  @Get('orders/:restaurantId')
  @ApiOperation({ summary: 'Get a list of orders within a date range (owner only)' })
  @ApiParam({ name: 'restaurantId', description: 'Restaurant UUID' })
  @ApiOkResponse({ description: 'A list of orders matching the criteria.' })
  async getOrderListReport(
    @Param('restaurantId', ParseUUIDPipe) restaurantId: string,
    @Query() query: OrderListQueryDto,
    @UserId() ownerId: string,
  ) {
    return this.reportsService.getOrderListReport(restaurantId, query, ownerId);
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
  @ApiOperation({ summary: 'Get daily stock movement for a restaurant (owner only)' })
  @ApiParam({ name: 'restaurantId', description: 'Restaurant UUID' })
  @ApiQuery({ name: 'date', description: 'Date in YYYY-MM-DD format', type: String })
  @ApiOkResponse({ description: 'A list of menu items with their stock movements for the given day.' })
  async getStockMovementReport(
    @Param('restaurantId', ParseUUIDPipe) restaurantId: string,
    @Query() query: StockMovementQueryDto,
    @UserId() ownerId: string,
  ) {
    return this.reportsService.getStockMovementReport(restaurantId, query.date, ownerId);
  }
  
  @Get('sales/summary/:restaurantId')
@ApiOperation({ summary: 'Get a sales summary for a date range (owner only)' })
@ApiParam({ name: 'restaurantId', description: 'Restaurant UUID' })
@ApiOkResponse({ description: 'An object containing the total orders and total revenue for the period.' })
async getSalesSummaryReport(
  @Param('restaurantId', ParseUUIDPipe) restaurantId: string,
  @Query() query: SalesSummaryQueryDto,
  @UserId() ownerId: string,
  @Res() res: ExpressResponse, // <-- 1. INJECT THE RESPONSE OBJECT
) {
  // 2. GET THE DATA FROM THE SERVICE (just like before)
  const data = await this.reportsService.getSalesSummaryReport(
    restaurantId,
    query.startDate,
    query.endDate,
    ownerId,
  );

  // 3. ADD THE CONDITIONAL LOGIC
  if (query.format === 'csv') {
    // The unparse function expects an array of objects.
    // Since our data is a single object, we wrap it in an array: [data]
    const csv = unparse([data]);

    res.header('Content-Type', 'text/csv');
    res.header('Content-Disposition', `attachment; filename="sales-summary-${query.startDate}-to-${query.endDate}.csv"`);
    
    res.send(csv);
  } else {
    // If format is not csv, send JSON
    res.json(data);
  }
}

  @Get('sales/top-items/:restaurantId')
  @ApiOperation({ summary: 'Get top selling menu items for a date range (owner only)' })
  @ApiParam({ name: 'restaurantId', description: 'Restaurant UUID' })
  @ApiOkResponse({ description: 'A ranked list of menu items by revenue, in either JSON or CSV format.' })
  async getTopSellingItemsReport(
    @Param('restaurantId', ParseUUIDPipe) restaurantId: string,
    @Query() query: SalesSummaryQueryDto,
    @Res() res: ExpressResponse,
    @UserId() ownerId: string,
  ) {
    const data = await this.reportsService.getTopSellingItemsReport(
      restaurantId,
      query.startDate,
      query.endDate,
      ownerId,
    );

    if (query.format === 'csv') {
      if (data.length === 0) {
        res.status(200).send('No data available for the selected period.');
        return;
      }
      
     const csv = unparse(data);

      res.header('Content-Type', 'text/csv');
      res.header('Content-Disposition', `attachment; filename="top-selling-items-${query.startDate}-to-${query.endDate}.csv"`);
      
      res.send(csv);
    } else {
      res.json(data);
    }
  }
}
