// src/modules/reports/reports.service.ts

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Inventory } from 'src/entities/inventory.entity';
import { Order } from 'src/entities/order.entity';
import { Repository } from 'typeorm';
import { ReportPeriod } from './dto/order-report-query.dto';

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(Inventory)
    private readonly inventoryRepository: Repository<Inventory>,
    // THIS IS THE LINE THAT WAS MISSING/INCORRECT BEFORE
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
  ) {}

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
}