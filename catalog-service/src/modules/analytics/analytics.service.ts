import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Order, OrderStatus, Restaurant } from '../../entities/order.entity';
import { RestaurantSummaryDto } from './dto/restaurant-summary.dto';
import * as dayjs from 'dayjs';
import { OrdersTrendQueryDto, TrendPeriod } from './dto/orders-trend-query.dto';
import { OrdersTrendDto } from './dto/orders-trend.dto';
import { RevenueTrendDto } from './dto/revenue-trend.dto';
import { TopMealDto } from './dto/top-meal.dto';
import { TopItemsQueryDto } from './dto/top-items-query.dto';
import { OrderItem } from 'src/entities/order-items.entity';
import { TopCustomerDto } from './dto/top-customer.dto';
import { PerformanceMetricsDto } from './dto/performance-metrics.dto';
import { OrderEvent } from 'src/entities/order-event.entity';
import { MostCancelledMealDto } from './dto/most-cancelled-meal.dto';
import { CancellationStatsDto } from './dto/cancellation-stats.dto';
import { AdminSummaryDto } from './dto/admin-summary.dto';
import { TopRestaurantDto } from './dto/top-restaurant.dto';
import { PaymentStatus } from 'src/entities/enums/payment-status.enum';
import { PaymentHealthDto } from './dto/payment-health.dto';
import { CACHE_MANAGER } from '@nestjs/cache-manager';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: any,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(OrderItem)
    private readonly orderItemRepository: Repository<OrderItem>,
    @InjectRepository(OrderEvent) private readonly orderEventRepository: Repository<OrderEvent>,
    @InjectRepository(Restaurant) private readonly restaurantRepository: Repository<Restaurant>,
    private readonly dataSource: DataSource,
  ) {}

  async getRestaurantSummary(
    restaurantId: string,
    ownerId: string,
  ): Promise<RestaurantSummaryDto> {
    const cacheKey = `analytics-summary-${ownerId}-${restaurantId}`;
    const cachedData = await this.cacheManager.get(cacheKey);
    if (cachedData) {
      this.logger.log(`Returning summary from CACHE for restaurant ${restaurantId}`);
      return cachedData;
    }
    this.logger.log(`Fetching summary from DB for restaurant ${restaurantId} by owner ${ownerId}`);
    const thirtyDaysAgo = dayjs().subtract(30, 'days').toDate();
    const stats = await this.orderRepository
        .createQueryBuilder('orders')
        .innerJoin('orders.restaurant', 'restaurant')
        .select('SUM(orders.total_amount)', 'totalRevenue')
        .addSelect('COUNT(orders.id)', 'totalOrders')
        .addSelect('AVG(orders.total_amount)', 'averageValue')
        .where('restaurant.id = :restaurantId', { restaurantId })
        .andWhere('restaurant.owner_id = :ownerId', { ownerId })
        .andWhere('orders.status = :status', { status: OrderStatus.COMPLETED })
        .andWhere('orders.created_at >= :startDate', { startDate: thirtyDaysAgo })
        .getRawOne();

    if (!stats || !stats.totalOrders) {
        const emptyResult = { totalRevenue: 0, totalOrders: 0, averageOrderValue: 0 };
        await this.cacheManager.set(cacheKey, emptyResult);
        return emptyResult;
    }
    const result = {
      totalRevenue: parseFloat(stats.totalRevenue) || 0,
      totalOrders: parseInt(stats.totalOrders, 10) || 0,
      averageOrderValue: parseFloat(stats.averageValue) || 0,
    };
    await this.cacheManager.set(cacheKey, result);
    return result;
  }

  async getOrderTrends(
    restaurantId: string,
    ownerId: string,
    query: OrdersTrendQueryDto,
  ): Promise<OrdersTrendDto[]> {
    const cacheKey = `analytics-order-trends-${ownerId}-${restaurantId}-${query.period}`;
    const cachedData = await this.cacheManager.get(cacheKey);
    if (cachedData) {
      this.logger.log(`Returning order trends from CACHE for restaurant ${restaurantId}`);
      return cachedData;
    }
    this.logger.log(`Fetching order trends from DB for restaurant ${restaurantId} with period ${query.period}`);
    const days = query.period === TrendPeriod.WEEK ? 7 : query.period === TrendPeriod.QUARTER ? 90 : 30;
    const startDate = dayjs().subtract(days - 1, 'day').startOf('day');
    const dbResults = await this.orderRepository
      .createQueryBuilder('orders')
      .innerJoin('orders.restaurant', 'restaurant')
      .select("TO_CHAR(orders.created_at, 'YYYY-MM-DD')", "date")
      .addSelect("COUNT(orders.id)::int", "orderCount")
      .where('restaurant.id = :restaurantId', { restaurantId })
      .andWhere('restaurant.owner_id = :ownerId', { ownerId })
      .andWhere('orders.status = :status', { status: OrderStatus.COMPLETED })
      .andWhere('orders.created_at >= :startDate', { startDate: startDate.toDate() })
      .groupBy('date')
      .orderBy('date', 'ASC')
      .getRawMany();
    const resultsMap = new Map<string, number>();
    for (const result of dbResults) {
      resultsMap.set(result.date, result.orderCount);
    }
    const trends: OrdersTrendDto[] = [];
    for (let i = 0; i < days; i++) {
      const date = startDate.add(i, 'day').format('YYYY-MM-DD');
      trends.push({
        date: date,
        orderCount: resultsMap.get(date) || 0,
      });
    }
    await this.cacheManager.set(cacheKey, trends);
    return trends;
  }

  async getRevenueTrends(
    restaurantId: string,
    ownerId: string,
    query: OrdersTrendQueryDto,
  ): Promise<RevenueTrendDto[]> {
    const cacheKey = `analytics-revenue-trends-${ownerId}-${restaurantId}-${query.period}`;
    const cachedData = await this.cacheManager.get(cacheKey);
    if (cachedData) {
      this.logger.log(`Returning revenue trends from CACHE for restaurant ${restaurantId}`);
      return cachedData;
    }
    this.logger.log(`Fetching revenue trends from DB for restaurant ${restaurantId} with period ${query.period}`);
    const days = query.period === TrendPeriod.WEEK ? 7 : query.period === TrendPeriod.QUARTER ? 90 : 30;
    const startDate = dayjs().subtract(days - 1, 'day').startOf('day');
    const dbResults = await this.orderRepository
      .createQueryBuilder('orders')
      .innerJoin('orders.restaurant', 'restaurant')
      .select("TO_CHAR(orders.created_at, 'YYYY-MM-DD')", "date")
      .addSelect("SUM(orders.total_amount)", "totalRevenue")
      .where('restaurant.id = :restaurantId', { restaurantId })
      .andWhere('restaurant.owner_id = :ownerId', { ownerId })
      .andWhere('orders.status = :status', { status: OrderStatus.COMPLETED })
      .andWhere('orders.created_at >= :startDate', { startDate: startDate.toDate() })
      .groupBy('date')
      .orderBy('date', 'ASC')
      .getRawMany();
    const resultsMap = new Map<string, number>();
    for (const result of dbResults) {
      resultsMap.set(result.date, parseFloat(result.totalRevenue));
    }
    const trends: RevenueTrendDto[] = [];
    for (let i = 0; i < days; i++) {
      const date = startDate.add(i, 'day').format('YYYY-MM-DD');
      trends.push({
        date: date,
        totalRevenue: resultsMap.get(date) || 0,
      });
    }
    await this.cacheManager.set(cacheKey, trends);
    return trends;
  }

  async getTopMeals(
    restaurantId: string,
    ownerId: string,
    query: TopItemsQueryDto,
  ): Promise<TopMealDto[]> {
    const cacheKey = `analytics-top-meals-${ownerId}-${restaurantId}-limit-${query.limit}`;
    const cachedData = await this.cacheManager.get(cacheKey);
    if (cachedData) {
      this.logger.log(`Returning top meals from CACHE for restaurant ${restaurantId}`);
      return cachedData;
    }
    this.logger.log(`Fetching top ${query.limit} meals from DB for restaurant ${restaurantId}`);
    const thirtyDaysAgo = dayjs().subtract(30, 'days').toDate();
    const topMeals = await this.orderItemRepository
      .createQueryBuilder('orderItem')
      .innerJoin('orderItem.order', 'order')
      .innerJoin('order.restaurant', 'restaurant')
      .innerJoin('orderItem.menu_item', 'menuItem')
      .select('menuItem.id', 'mealId')
      .addSelect('menuItem.name', 'mealName')
      .addSelect('SUM(orderItem.quantity)::int', 'quantitySold')
      .where('restaurant.id = :restaurantId', { restaurantId })
      .andWhere('restaurant.owner_id = :ownerId', { ownerId })
      .andWhere('order.status = :status', { status: OrderStatus.COMPLETED })
      .andWhere('order.created_at >= :startDate', { startDate: thirtyDaysAgo })
      .groupBy('menuItem.id, menuItem.name')
      .orderBy('SUM(orderItem.quantity)', 'DESC')
      .limit(query.limit)
      .getRawMany<TopMealDto>();
    await this.cacheManager.set(cacheKey, topMeals);
    return topMeals;
  }

  async getTopCustomers(
    restaurantId: string,
    ownerId: string,
    query: TopItemsQueryDto,
  ): Promise<TopCustomerDto[]> {
    const cacheKey = `analytics-top-customers-${ownerId}-${restaurantId}-limit-${query.limit}`;
    const cachedData = await this.cacheManager.get(cacheKey);
    if (cachedData) {
      this.logger.log(`Returning top customers from CACHE for restaurant ${restaurantId}`);
      return cachedData;
    }
    this.logger.log(`Fetching top ${query.limit} customers from DB for restaurant ${restaurantId}`);
    const thirtyDaysAgo = dayjs().subtract(30, 'days').toDate();
    const topCustomers = await this.orderRepository
      .createQueryBuilder('orders')
      .innerJoin('orders.restaurant', 'restaurant')
      .select('orders.customer_id', 'customerId')
      .addSelect('orders.customer_name', 'customerName')
      .addSelect('COUNT(orders.id)::int', 'orderCount')
      .where('restaurant.id = :restaurantId', { restaurantId })
      .andWhere('restaurant.owner_id = :ownerId', { ownerId })
      .andWhere('orders.status = :status', { status: OrderStatus.COMPLETED })
      .andWhere('orders.created_at >= :startDate', { startDate: thirtyDaysAgo })
      .groupBy('orders.customer_id, orders.customer_name')
      .orderBy('COUNT(orders.id)', 'DESC')
      .limit(query.limit)
      .getRawMany<TopCustomerDto>();
    await this.cacheManager.set(cacheKey, topCustomers);
    return topCustomers;
  }

  async getPerformanceMetrics(
    restaurantId: string,
    ownerId: string,
  ): Promise<PerformanceMetricsDto> {
    const cacheKey = `analytics-performance-${ownerId}-${restaurantId}`;
    const cachedData = await this.cacheManager.get(cacheKey);
    if (cachedData) {
      this.logger.log(`Returning performance metrics from CACHE for restaurant ${restaurantId}`);
      return cachedData;
    }
    this.logger.log(`Fetching preparation performance from DB for restaurant ${restaurantId}`);
    const thirtyDaysAgo = dayjs().subtract(30, 'days').toDate();
    const subQuery = this.orderEventRepository
      .createQueryBuilder('event')
      .select('event.order_id')
      .addSelect("MAX(CASE WHEN event.action = 'OWNER_PREPARING' THEN event.created_at END)", 'preparing_at')
      .addSelect("MAX(CASE WHEN event.action = 'OWNER_MARKED_READY' THEN event.created_at END)", 'ready_at')
      .innerJoin('event.order', 'order')
      .innerJoin('order.restaurant', 'restaurant')
      .where('restaurant.id = :restaurantId', { restaurantId })
      .andWhere('restaurant.owner_id = :ownerId', { ownerId })
      .andWhere('event.created_at >= :thirtyDaysAgo', { thirtyDaysAgo })
      .groupBy('event.order_id');
    const metricsResult = await this.orderEventRepository.manager.connection
      .createQueryBuilder()
      .select('AVG(EXTRACT(EPOCH FROM (pivoted_events.ready_at - pivoted_events.preparing_at)) / 60)','averagePreparationTimeMinutes')
      .from(`(${subQuery.getQuery()})`, 'pivoted_events')
      .setParameters(subQuery.getParameters())
      .getRawOne();
    const metrics = {
      averagePreparationTimeMinutes: parseFloat(metricsResult.averagePreparationTimeMinutes) || 0,
    };
    await this.cacheManager.set(cacheKey, metrics);
    return metrics;
  }

  async getCancellationStats(
    restaurantId: string,
    ownerId: string,
  ): Promise<CancellationStatsDto> {
    const cacheKey = `analytics-cancellations-${ownerId}-${restaurantId}`;
    const cachedData = await this.cacheManager.get(cacheKey);
    if (cachedData) {
      this.logger.log(`Returning cancellation stats from CACHE for restaurant ${restaurantId}`);
      return cachedData;
    }
    this.logger.log(`Fetching cancellation stats from DB for restaurant ${restaurantId}`);
    const thirtyDaysAgo = dayjs().subtract(30, 'days').toDate();
    const orderCounts = await this.orderRepository
      .createQueryBuilder('orders')
      .innerJoin('orders.restaurant', 'restaurant')
      .select('COUNT(*)::int', 'totalOrders')
      .addSelect("COUNT(*) FILTER (WHERE orders.status = :cancelledStatus)::int",'totalCancellations')
      .where('restaurant.id = :restaurantId', { restaurantId })
      .andWhere('restaurant.owner_id = :ownerId', { ownerId })
      .andWhere('orders.created_at >= :startDate', { startDate: thirtyDaysAgo })
      .setParameters({ cancelledStatus: OrderStatus.CANCELLED })
      .getRawOne();
    const mostCancelledMeal = await this.orderItemRepository
      .createQueryBuilder('orderItem')
      .innerJoin('orderItem.order', 'order')
      .innerJoin('order.restaurant', 'restaurant')
      .innerJoin('orderItem.menu_item', 'menuItem')
      .select('menuItem.id', 'mealId')
      .addSelect('menuItem.name', 'mealName')
      .addSelect('SUM(orderItem.quantity)::int', 'cancellationCount')
      .where('order.status = :cancelledStatus', { cancelledStatus: OrderStatus.CANCELLED })
      .andWhere('restaurant.id = :restaurantId', { restaurantId })
      .andWhere('restaurant.owner_id = :ownerId', { ownerId })
      .andWhere('order.created_at >= :startDate', { startDate: thirtyDaysAgo })
      .groupBy('menuItem.id, menuItem.name')
      .orderBy('SUM(orderItem.quantity)', 'DESC')
      .limit(1)
      .getRawOne<MostCancelledMealDto>();
    const totalCancellations = orderCounts.totalCancellations || 0;
    const totalOrders = orderCounts.totalOrders || 0;
    const cancellationRate = totalOrders > 0 ? totalCancellations / totalOrders : 0;
    const stats = {
      totalCancellations,
      cancellationRate,
      mostCancelledMeal: mostCancelledMeal || null,
    };
    await this.cacheManager.set(cacheKey, stats);
    return stats;
  }

  async getAdminSummary(): Promise<AdminSummaryDto> {
    const cacheKey = `analytics-admin-summary`;
    const cachedData = await this.cacheManager.get(cacheKey);
    if (cachedData) {
      this.logger.log(`Returning admin summary from CACHE`);
      return cachedData;
    }
    this.logger.log(`Fetching platform-wide admin summary from DB`);
    const thirtyDaysAgo = dayjs().subtract(30, 'days').toDate();
    const platformOrderStats = await this.orderRepository
      .createQueryBuilder('orders')
      .select('SUM(orders.total_amount)', 'totalPlatformRevenue')
      .addSelect('COUNT(orders.id)::int', 'totalPlatformOrders')
      .where('orders.status = :status', { status: OrderStatus.COMPLETED })
      .andWhere('orders.created_at >= :startDate', { startDate: thirtyDaysAgo })
      .getRawOne();
      
    // MODIFICATION: The 'newCustomerSignups' property has been removed.
    const summary = {
      totalPlatformRevenue: parseFloat(platformOrderStats.totalPlatformRevenue) || 0,
      totalPlatformOrders: platformOrderStats.totalPlatformOrders || 0,
    };
    
    await this.cacheManager.set(cacheKey, summary);
    return summary;
  }

 // REPLACE your old method with this new one
async getTopRestaurants(query: TopItemsQueryDto): Promise<TopRestaurantDto[]> {
    const cacheKey = `analytics-top-restaurants-limit-${query.limit}`;
    const cachedData = await this.cacheManager.get(cacheKey);
    if (cachedData) {
        this.logger.log(`Returning top restaurants from CACHE`);
        return cachedData;
    }
    this.logger.log(`Fetching top ${query.limit} performing restaurants from MATERIALIZED VIEW`);

    const thirtyDaysAgo = dayjs().subtract(30, 'days').format('YYYY-MM-DD');

    // This query is now incredibly simple. It sums up pre-calculated daily totals.
    const rawResults = await this.dataSource.query(`
        SELECT
            restaurant_id AS "restaurantId",
            restaurant_name AS "restaurantName",
            SUM(total_revenue) AS "totalRevenue"
        FROM
            mv_daily_restaurant_revenue
        WHERE
            summary_date >= $1
        GROUP BY
            restaurant_id, restaurant_name
        ORDER BY
            "totalRevenue" DESC
        LIMIT $2;
    `, [thirtyDaysAgo, query.limit]);

    const restaurants = rawResults.map(r => ({
        restaurantId: r.restaurantId,
        restaurantName: r.restaurantName,
        totalRevenue: parseFloat(r.totalRevenue || '0'),
    }));
    
    await this.cacheManager.set(cacheKey, restaurants);
    return restaurants;
}

  async getLowPerformingRestaurants(query: TopItemsQueryDto): Promise<TopRestaurantDto[]> {
    const cacheKey = `analytics-low-restaurants-limit-${query.limit}`;
    const cachedData = await this.cacheManager.get(cacheKey);
    if (cachedData) {
      this.logger.log(`Returning low-performing restaurants from CACHE`);
      return cachedData;
    }
    this.logger.log(`Fetching top ${query.limit} low-performing restaurants from DB`);
    const thirtyDaysAgo = dayjs().subtract(30, 'days').toDate();
    const rawResults = await this.restaurantRepository
      .createQueryBuilder('restaurant')
      .leftJoin('orders','orders','orders.restaurant_id = restaurant.id AND orders.status = :status AND orders.created_at >= :startDate',
        { status: OrderStatus.COMPLETED, startDate: thirtyDaysAgo }
      )
      .select('restaurant.id', 'restaurantId')
      .addSelect('restaurant.name', 'restaurantName')
      .addSelect('COALESCE(SUM(orders.total_amount), 0)', 'totalRevenue')
      .groupBy('restaurant.id, restaurant.name')
      .orderBy('COALESCE(SUM(orders.total_amount), 0)', 'ASC')
      .limit(query.limit)
      .getRawMany();
    const restaurants = rawResults.map(r => ({
      restaurantId: r.restaurantId,
      restaurantName: r.restaurantName,
      totalRevenue: parseFloat(r.totalRevenue) || 0,
    }));
    await this.cacheManager.set(cacheKey, restaurants);
    return restaurants;
  }

  async getPlatformTopMeals(query: TopItemsQueryDto): Promise<TopMealDto[]> {
    const cacheKey = `analytics-platform-top-meals-limit-${query.limit}`;
    const cachedData = await this.cacheManager.get(cacheKey);
    if (cachedData) {
      this.logger.log(`Returning platform top meals from CACHE`);
      return cachedData;
    }
    this.logger.log(`Fetching top ${query.limit} meals across the platform from DB`);
    const thirtyDaysAgo = dayjs().subtract(30, 'days').toDate();
    const topMeals = await this.orderItemRepository
      .createQueryBuilder('orderItem')
      .innerJoin('orderItem.order', 'order')
      .innerJoin('orderItem.menu_item', 'menuItem')
      .select('menuItem.id', 'mealId')
      .addSelect('menuItem.name', 'mealName')
      .addSelect('SUM(orderItem.quantity)::int', 'quantitySold')
      .where('order.status = :status', { status: OrderStatus.COMPLETED })
      .andWhere('order.created_at >= :startDate', { startDate: thirtyDaysAgo })
      .groupBy('menuItem.id, menuItem.name')
      .orderBy('SUM(orderItem.quantity)', 'DESC')
      .limit(query.limit)
      .getRawMany<TopMealDto>();
    await this.cacheManager.set(cacheKey, topMeals);
    return topMeals;
  }

  async getPlatformOrderTrends(query: OrdersTrendQueryDto): Promise<OrdersTrendDto[]> {
    const cacheKey = `analytics-platform-order-trends-${query.period}`;
    const cachedData = await this.cacheManager.get(cacheKey);
    if (cachedData) {
      this.logger.log(`Returning platform order trends from CACHE`);
      return cachedData;
    }
    this.logger.log(`Fetching platform-wide order trends from DB with period ${query.period}`);
    const days = query.period === TrendPeriod.WEEK ? 7 : query.period === TrendPeriod.QUARTER ? 90 : 30;
    const startDate = dayjs().subtract(days - 1, 'day').startOf('day');
    const dbResults = await this.orderRepository
      .createQueryBuilder('orders')
      .select("TO_CHAR(orders.created_at, 'YYYY-MM-DD')", "date")
      .addSelect("COUNT(orders.id)::int", "orderCount")
      .where('orders.status = :status', { status: OrderStatus.COMPLETED })
      .andWhere('orders.created_at >= :startDate', { startDate: startDate.toDate() })
      .groupBy('date')
      .orderBy('date', 'ASC')
      .getRawMany();
    const resultsMap = new Map<string, number>();
    for (const result of dbResults) {
      resultsMap.set(result.date, result.orderCount);
    }
    const trends: OrdersTrendDto[] = [];
    for (let i = 0; i < days; i++) {
      const date = startDate.add(i, 'day').format('YYYY-MM-DD');
      trends.push({
        date: date,
        orderCount: resultsMap.get(date) || 0,
      });
    }
    await this.cacheManager.set(cacheKey, trends);
    return trends;
  }

  async getPaymentHealth(): Promise<PaymentHealthDto> {
    const cacheKey = `analytics-payment-health`;
    const cachedData = await this.cacheManager.get(cacheKey);
    if (cachedData) {
      this.logger.log(`Returning payment health from CACHE`);
      return cachedData;
    }
    this.logger.log(`Fetching platform-wide payment health from DB`);
    const thirtyDaysAgo = dayjs().subtract(30, 'days').toDate();
    const paymentStats = await this.orderRepository
      .createQueryBuilder('orders')
      .select("COUNT(*) FILTER (WHERE orders.payment_status = :paidStatus)::int",'successfulPayments')
      .addSelect("COUNT(*) FILTER (WHERE orders.payment_status = :failedStatus)::int",'failedPayments')
      .where('orders.created_at >= :startDate', { startDate: thirtyDaysAgo })
      .andWhere("orders.payment_status IN (:...statuses)", {
        statuses: [PaymentStatus.PAID, PaymentStatus.FAILED]
      })
      .setParameters({
        paidStatus: PaymentStatus.PAID,
        failedStatus: PaymentStatus.FAILED,
      })
      .getRawOne();
    const successfulPayments = paymentStats.successfulPayments || 0;
    const failedPayments = paymentStats.failedPayments || 0;
    const totalPayments = successfulPayments + failedPayments;
    const successRate = totalPayments > 0 ? successfulPayments / totalPayments : 0;
    const health = {
      successfulPayments,
      failedPayments,
      successRate,
    };
    await this.cacheManager.set(cacheKey, health);
    return health;
  }
}