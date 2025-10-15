// src/modules/reports/reports.service.ts

import { Injectable, Logger } from '@nestjs/common'; // <-- Logger Added
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm'; // <-- Between Added
import { Cron, CronExpression } from '@nestjs/schedule'; // <-- Cron Added
import { Inventory } from 'src/entities/inventory.entity';
import { Order } from 'src/entities/order.entity';
import { MenuInventoryHistory } from 'src/entities/menu-inventory.entity'; // <-- New Entity
import { InventoryLog, InventoryChangeType } from 'src/entities/inventory-log.entity'; // <-- New Entity
import { ReportPeriod } from './dto/order-report-query.dto';
import { MenuItem } from 'src/entities/menu-item.entity';
import { OrderListQueryDto } from './dto/order-list-query.dto';

@Injectable()
export class ReportsService {
  // --- NEW: Logger for Cron Job ---
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    @InjectRepository(Inventory)
    private readonly inventoryRepository: Repository<Inventory>,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    // --- NEW: Repositories for Cron Job ---
    @InjectRepository(MenuInventoryHistory)
    private readonly historyRepository: Repository<MenuInventoryHistory>,
    @InjectRepository(InventoryLog)
    private readonly logRepository: Repository<InventoryLog>,
  ) {}

  // ====================================================================
  // YOUR EXISTING METHODS (UNCHANGED)
  // ====================================================================

  async getLowStockReport(restaurantId: string): Promise<Inventory[]> {
    return this.inventoryRepository
      .createQueryBuilder('inventory')
      .leftJoinAndSelect('inventory.menu_item', 'menuItem')
      .where('inventory.restaurant_id = :restaurantId', { restaurantId })
      .andWhere('inventory.stock_quantity <= inventory.reorder_level')
      .orderBy('menuItem.name', 'ASC')
      .getMany();
  }

  async getOrderReport(restaurantId: string, period: ReportPeriod) {
    const queryBuilder = this.orderRepository.createQueryBuilder('order');

    // This is a simple but effective way to handle periods
    const dateFilter = `order.created_at >= NOW() - interval '1 ${period}'`;

    const result = await queryBuilder
      .select('COUNT(order.id)', 'totalOrders')
      .addSelect('SUM(order.total_amount)', 'totalRevenue')
      .where('order.restaurant_id = :restaurantId', { restaurantId })
      .andWhere(dateFilter)
      .andWhere("order.status NOT IN ('PENDING', 'DECLINED', 'CANCELLED')")
      .getRawOne();

    return {
      period,
      totalOrders: parseInt(result.totalOrders, 10) || 0,
      totalRevenue: parseFloat(result.totalRevenue) || 0,
    };
  }

  // ====================================================================
  // NEW: Daily Inventory Snapshot Cron Job
  // ====================================================================

  /**
   * This cron job runs every day at 1 AM to generate the inventory
   * summary report for the PREVIOUS day.
   */
  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async handleDailyInventorySnapshot() {
    this.logger.log('Starting daily inventory snapshot generation...');
    
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    
    const startOfYesterday = new Date(yesterday.setHours(0, 0, 0, 0));
    const endOfYesterday = new Date(yesterday.setHours(23, 59, 59, 999));

    this.logger.log(`Generating report for date: ${startOfYesterday.toISOString().split('T')[0]}`);

    await this.generateSnapshotForDate(startOfYesterday, endOfYesterday);

    this.logger.log('Daily inventory snapshot generation complete.');
  }

  async generateSnapshotForDate(startDate: Date, endDate: Date) {
    // 1. Get all inventory logs from the specified date range
    const logsFromPeriod = await this.logRepository.find({
      where: { created_at: Between(startDate, endDate) },
      relations: ['inventory'],
    });
  
    // Find the unique inventory items that had activity
    const activeInventoryIds = [
      ...new Set(logsFromPeriod.map((log) => log.inventory.id)),
    ];
  
    if (activeInventoryIds.length === 0) {
      this.logger.log('No inventory activity in the period. Skipping snapshot.');
      return;
    }
  
    // 2. Process each active inventory item
    for (const inventoryId of activeInventoryIds) {
      const inventoryItem = await this.inventoryRepository.findOne({
        where: { id: inventoryId },
      });
      if (!inventoryItem) continue;
  
      // Filter logs for just this specific item
      const itemLogs = logsFromPeriod.filter(
        (log) => log.inventory.id === inventoryId,
      );
  
      // Calculate totals for the entire day based on ALL logs for that day
      const soldQuantity = itemLogs
        .filter((log) => log.change_type === InventoryChangeType.ORDER_DEDUCTION)
        .reduce((sum, log) => sum + Math.abs(log.quantity_change), 0);
  
      const manualAdjustments = itemLogs
        .filter(
          (log) =>
            log.change_type === InventoryChangeType.MANUAL_UPDATE ||
            log.change_type === InventoryChangeType.RESTOCK ||
            log.change_type === InventoryChangeType.CANCEL_ROLLBACK,
        )
        .reduce((sum, log) => sum + log.quantity_change, 0);
  
      const closingStock = inventoryItem.stock_quantity;
      // Corrected calculation for opening stock
      const openingStock = closingStock - manualAdjustments - soldQuantity; 
  
      // --- THE FIX: UPSERT LOGIC ---
      // Try to find an existing snapshot for this item and day
      let snapshot = await this.historyRepository.findOne({
        where: {
          menuItemId: inventoryItem.menu_item_id,
          batchDate: startDate,
        },
      });
  
      if (!snapshot) {
        // If it doesn't exist, create a new one
        snapshot = this.historyRepository.create({
          menuItemId: inventoryItem.menu_item_id,
          restaurantId: inventoryItem.restaurant_id,
          batchDate: startDate,
        });
        this.logger.log(`Creating new snapshot for menu item: ${inventoryItem.menu_item_id}`);
      } else {
        this.logger.log(`Updating existing snapshot for menu item: ${inventoryItem.menu_item_id}`);
      }
  
      // Update the snapshot (new or existing) with the fresh calculations
      snapshot.openingStock = openingStock;
      snapshot.soldQuantity = soldQuantity;
      snapshot.manualAdjustments = manualAdjustments;
      snapshot.closingStock = closingStock;
  
      // Save the record. TypeORM's save method handles both INSERT and UPDATE.
      await this.historyRepository.save(snapshot);
    }
  }
  async getStockMovementReport(
  restaurantId: string,
  date: string,
): Promise<any[]> {
  this.logger.log(
    `Fetching stock movement report for restaurant ${restaurantId} on date ${date}`,
  );

  const reportData = await this.historyRepository
    .createQueryBuilder('history')
    .leftJoin(MenuItem, 'menuItem', 'menuItem.id = history.menuItemId')
    .select([
      'history.menuItemId AS "menuItemId"',
      'menuItem.name AS "itemName"',
      'history.openingStock AS "openingStock"',
      'history.soldQuantity AS "soldQuantity"',
      'history.manualAdjustments AS "manualAdjustments"',
      'history.closingStock AS "closingStock"',
    ])
    .where('history.restaurantId = :restaurantId', { restaurantId })
    .andWhere('history.batchDate = :date', { date })
    .orderBy('menuItem.name', 'ASC')
    .getRawMany(); // getRawMany is efficient for custom report shapes

  return reportData;
}
async getSalesSummaryReport(
  restaurantId: string,
  startDate: string,
  endDate: string,
): Promise<{ totalOrders: number; totalRevenue: number }> {
  this.logger.log(
    `Generating sales summary for restaurant ${restaurantId} from ${startDate} to ${endDate}`,
  );

  // We need to adjust the endDate to be inclusive of the whole day
  const inclusiveEndDate = new Date(endDate);
  inclusiveEndDate.setHours(23, 59, 59, 999);

  const result = await this.orderRepository
    .createQueryBuilder('order')
    .select('COUNT(order.id)', 'totalOrders')
    .addSelect('SUM(order.total_amount)', 'totalRevenue')
    .where('order.restaurant_id = :restaurantId', { restaurantId })
    .andWhere('order.created_at >= :startDate', { startDate })
    .andWhere('order.created_at <= :endDate', { endDate: inclusiveEndDate })
    .andWhere("order.status NOT IN (:...statuses)", { 
      statuses: ['PENDING', 'CANCELLED', 'DECLINED'] 
    })
    .getRawOne(); // Use getRawOne for aggregate queries

  // .getRawOne() returns strings, so we need to parse them.
  // We also provide fallbacks in case there are no orders in the period.
  const totalOrders = parseInt(result.totalOrders, 10) || 0;
  const totalRevenue = parseFloat(result.totalRevenue) || 0;

  return { totalOrders, totalRevenue };
}
// Add this method inside the ReportsService class in reports.service.ts

async getTopSellingItemsReport(
  restaurantId: string,
  startDate: string,
  endDate: string,
): Promise<any[]> {
  this.logger.log(
    `Generating top selling items report for restaurant ${restaurantId} from ${startDate} to ${endDate}`,
  );

  const inclusiveEndDate = new Date(endDate);
  inclusiveEndDate.setHours(23, 59, 59, 999);

  const topItems = await this.orderRepository
    .createQueryBuilder('order')
    .innerJoin('order.items', 'order_item') // Join with order_items table
    .innerJoin('order_item.menu_item', 'menu_item') // Join with menu_items table
    .select([
      'menu_item.id AS "menuItemId"',
      'menu_item.name AS "itemName"',
    ])
    .addSelect('SUM(order_item.quantity)', 'quantitySold')
    .addSelect('SUM(order_item.quantity * order_item.unit_price)', 'totalRevenue')
    .where('order.restaurant_id = :restaurantId', { restaurantId })
    .andWhere('order.created_at >= :startDate', { startDate })
    .andWhere('order.created_at <= :endDate', { endDate: inclusiveEndDate })
    .andWhere("order.status NOT IN (:...statuses)", {
      statuses: ['PENDING', 'CANCELLED', 'DECLINED'],
    })
    .groupBy('menu_item.id, menu_item.name') // Group results by each unique menu item
    .orderBy('"totalRevenue"', 'DESC') // Order by the calculated revenue, highest first
    .limit(10) // Let's start with the Top 10
    .getRawMany();

  // The values from getRawMany are strings, so we parse them for a clean response
  return topItems.map(item => ({
    ...item,
    quantitySold: parseInt(item.quantitySold, 10),
    totalRevenue: parseFloat(item.totalRevenue),
  }));
}
async getOrderListReport(
  restaurantId: string,
  query: OrderListQueryDto,
): Promise<Order[]> {
  this.logger.log(
    `Generating order list for restaurant ${restaurantId} with status: ${query.status || 'ALL'}`,
  );

  const { startDate, endDate, status } = query;

  const inclusiveEndDate = new Date(endDate);
  inclusiveEndDate.setHours(23, 59, 59, 999);

  const queryBuilder = this.orderRepository
    .createQueryBuilder('order')
    .leftJoinAndSelect('order.items', 'order_item') // Include order items
    .leftJoinAndSelect('order_item.menu_item', 'menu_item') // Include menu item details
    .where('order.restaurant_id = :restaurantId', { restaurantId })
    .andWhere('order.created_at >= :startDate', { startDate })
    .andWhere('order.created_at <= :endDate', { endDate: inclusiveEndDate })
    .orderBy('order.created_at', 'DESC'); // Show the most recent orders first

  // Conditionally add the status filter
  if (status) {
    queryBuilder.andWhere('order.status = :status', { status });
  }

  return queryBuilder.getMany();
}
}