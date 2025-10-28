import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Inventory } from 'src/entities/inventory.entity';
import { Order } from 'src/entities/order.entity';
import { MenuInventoryHistory } from 'src/entities/menu-inventory.entity';
import { InventoryLog, InventoryChangeType } from 'src/entities/inventory-log.entity';
import { ReportPeriod } from './dto/order-report-query.dto';
import { MenuItem } from 'src/entities/menu-item.entity';
import { OrderListQueryDto } from './dto/order-list-query.dto';
import { Restaurant } from 'src/entities/restaurant.entity';

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    @InjectRepository(Inventory)
    private readonly inventoryRepository: Repository<Inventory>,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(MenuInventoryHistory)
    private readonly historyRepository: Repository<MenuInventoryHistory>,
    @InjectRepository(InventoryLog)
    private readonly logRepository: Repository<InventoryLog>,
    @InjectRepository(Restaurant)
    private readonly restaurantRepository: Repository<Restaurant>,
  ) {}

  private async validateOwnerAccess(restaurantId: string, ownerId: string): Promise<void> {
    const restaurant = await this.restaurantRepository.findOne({
      where: { id: restaurantId, owner_id: ownerId },
      select: ['id'],
    });

    if (!restaurant) {
      throw new ForbiddenException('You do not have permission to access reports for this restaurant.');
    }
  }

  async getLowStockReport(restaurantId: string, ownerId: string): Promise<Inventory[]> {
    await this.validateOwnerAccess(restaurantId, ownerId);
    
    return this.inventoryRepository
      .createQueryBuilder('inventory')
      .leftJoinAndSelect('inventory.menu_item', 'menuItem')
      .where('inventory.restaurant_id = :restaurantId', { restaurantId })
      .andWhere('inventory.stock_quantity <= inventory.reorder_level')
      .orderBy('menuItem.name', 'ASC')
      .getMany();
  }

  async getOrderReport(restaurantId: string, period: ReportPeriod, ownerId: string) {
    await this.validateOwnerAccess(restaurantId, ownerId);
    
    const queryBuilder = this.orderRepository.createQueryBuilder('order');

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
    const logsFromPeriod = await this.logRepository.find({
      where: { created_at: Between(startDate, endDate) },
      relations: ['inventory'],
    });
  
    const activeInventoryIds = [
      ...new Set(logsFromPeriod.map((log) => log.inventory.id)),
    ];
  
    if (activeInventoryIds.length === 0) {
      this.logger.log('No inventory activity in the period. Skipping snapshot.');
      return;
    }
  
    for (const inventoryId of activeInventoryIds) {
      const inventoryItem = await this.inventoryRepository.findOne({
        where: { id: inventoryId },
      });
      if (!inventoryItem) continue;
  
      const itemLogs = logsFromPeriod.filter(
        (log) => log.inventory.id === inventoryId,
      );
  
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
      const openingStock = closingStock - manualAdjustments - soldQuantity; 
  
      let snapshot = await this.historyRepository.findOne({
        where: {
          menuItemId: inventoryItem.menu_item_id,
          batchDate: startDate,
        },
      });
  
      if (!snapshot) {
        snapshot = this.historyRepository.create({
          menuItemId: inventoryItem.menu_item_id,
          restaurantId: inventoryItem.restaurant_id,
          batchDate: startDate,
        });
        this.logger.log(`Creating new snapshot for menu item: ${inventoryItem.menu_item_id}`);
      } else {
        this.logger.log(`Updating existing snapshot for menu item: ${inventoryItem.menu_item_id}`);
      }
  
      snapshot.openingStock = openingStock;
      snapshot.soldQuantity = soldQuantity;
      snapshot.manualAdjustments = manualAdjustments;
      snapshot.closingStock = closingStock;
  
      await this.historyRepository.save(snapshot);
    }
  }
  
  async getStockMovementReport(restaurantId: string, date: string, ownerId: string): Promise<any[]> {
    await this.validateOwnerAccess(restaurantId, ownerId);
    
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
      .getRawMany();

    return reportData;
  }
  
  async getSalesSummaryReport(restaurantId: string, startDate: string, endDate: string, ownerId: string): Promise<{ totalOrders: number; totalRevenue: number }> {
    await this.validateOwnerAccess(restaurantId, ownerId);
    
    this.logger.log(
      `Generating sales summary for restaurant ${restaurantId} from ${startDate} to ${endDate}`,
    );

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
      .getRawOne();

    const totalOrders = parseInt(result.totalOrders, 10) || 0;
    const totalRevenue = parseFloat(result.totalRevenue) || 0;

    return { totalOrders, totalRevenue };
  }
  
  async getTopSellingItemsReport(restaurantId: string, startDate: string, endDate: string, ownerId: string): Promise<any[]> {
    await this.validateOwnerAccess(restaurantId, ownerId);
    
    this.logger.log(
      `Generating top selling items report for restaurant ${restaurantId} from ${startDate} to ${endDate}`,
    );

    const inclusiveEndDate = new Date(endDate);
    inclusiveEndDate.setHours(23, 59, 59, 999);

    const topItems = await this.orderRepository
      .createQueryBuilder('order')
      .innerJoin('order.items', 'order_item')
      .innerJoin('order_item.menu_item', 'menu_item')
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
      .groupBy('menu_item.id, menu_item.name')
      .orderBy('"totalRevenue"', 'DESC')
      .limit(10)
      .getRawMany();

    return topItems.map(item => ({
      ...item,
      quantitySold: parseInt(item.quantitySold, 10),
      totalRevenue: parseFloat(item.totalRevenue),
    }));
  }
  
  async getOrderListReport(restaurantId: string, query: OrderListQueryDto, ownerId: string): Promise<Order[]> {
    await this.validateOwnerAccess(restaurantId, ownerId);
    
    this.logger.log(
      `Generating order list for restaurant ${restaurantId} with status: ${query.status || 'ALL'}`,
    );

    const { startDate, endDate, status } = query;

    const inclusiveEndDate = new Date(endDate);
    inclusiveEndDate.setHours(23, 59, 59, 999);

    const queryBuilder = this.orderRepository
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.items', 'order_item')
      .leftJoinAndSelect('order_item.menu_item', 'menu_item')
      .where('order.restaurant_id = :restaurantId', { restaurantId })
      .andWhere('order.created_at >= :startDate', { startDate })
      .andWhere('order.created_at <= :endDate', { endDate: inclusiveEndDate })
      .orderBy('order.created_at', 'DESC');

    if (status) {
      queryBuilder.andWhere('order.status = :status', { status });
    }

    return queryBuilder.getMany();
  }
}
