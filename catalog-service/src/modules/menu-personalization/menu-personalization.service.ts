
import { Injectable, Logger, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

import { CustomerMenuRanking } from '../../entities/customer-menu-ranking.entity';
import { MenuItem } from '../../entities/menu-item.entity';
import { Order } from '../../entities/order.entity';

@Injectable()
export class MenuPersonalizationService {
  private readonly logger = new Logger(MenuPersonalizationService.name);

  constructor(
    @InjectRepository(CustomerMenuRanking)
    private readonly rankingRepo: Repository<CustomerMenuRanking>,

    @InjectRepository(MenuItem)
    private readonly menuItemRepo: Repository<MenuItem>,

    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  private globalCacheKey(customerId: string): string {
    return `customer:${customerId}:personalized_menu`;
  }

  async incrementMenuRanking(customerId: string, menuItemId: string): Promise<void> {
    try {
      const existing = await this.rankingRepo.findOne({
        where: { customer_id: customerId, menu_item_id: menuItemId },
      });

      if (existing) {
        existing.order_count = Number(existing.order_count) + 1;
        await this.rankingRepo.save(existing);
      } else {
        const rec = this.rankingRepo.create({
          customer_id: customerId,
          menu_item_id: menuItemId,
          order_count: 1,
        });
        await this.rankingRepo.save(rec);
      }

      // invalidate cache via cache-manager
      await this.cacheManager.del(this.globalCacheKey(customerId));
    } catch (err) {
      this.logger.warn(`incrementMenuRanking failed for customer=${customerId} menuItem=${menuItemId}`, err as any);
    }
  }

  async trackOrderItemsForPersonalization(order: Order): Promise<void> {
    if (!order || !order.items || order.items.length === 0) return;

    const customerId = order.customer_id;
    const tasks: Promise<void>[] = [];

    for (const item of order.items) {
      if (item.menu_item_id) {
        tasks.push(this.incrementMenuRanking(customerId, item.menu_item_id));
      }
    }

    try {
      await Promise.all(tasks);
    } catch (err) {
      this.logger.warn(`trackOrderItemsForPersonalization had errors for order ${order.id}`, err as any);
    }
  }

  async getGlobalPersonalizedMenu(customerId: string, limit = 50): Promise<MenuItem[]> {
    const key = this.globalCacheKey(customerId);

    try {
      const cached = await this.cacheManager.get<MenuItem[]>(key);
      if (cached) {
        return cached as MenuItem[];
      }
    } catch (err) {
      this.logger.warn('Failed reading personalized menu from cache', err as any);
    }

    try {
      const rows = await this.rankingRepo
        .createQueryBuilder('rank')
        .innerJoinAndSelect('rank.menu_item', 'menu')
        .orderBy('rank.order_count', 'DESC')
        .take(limit)
        .getMany();

      const menuItems = rows.map((r) => r.menu_item);

      // store in cache (ttl in seconds). cache-manager supports third arg as ttl or options object depending on store
      try {
        // If your cache-manager supports set(key, value, ttl) you can use number. Otherwise use options object.
        // Using options object for broader compatibility:
        await this.cacheManager.set(key, menuItems, { ttl: 60 * 30 }); // 30 minutes
      } catch (err) {
        this.logger.warn('Failed caching personalized menu', err as any);
      }

      return menuItems;
    } catch (err) {
      this.logger.error('Failed to fetch global personalized menu from DB', err as any);
      return [];
    }
  }

  async getPersonalizedRestaurantMenu(customerId: string, restaurantId: string, limit = 200): Promise<MenuItem[]> {
    const restaurantMenu = await this.menuItemRepo
      .createQueryBuilder('mi')
      .leftJoinAndSelect('mi.category', 'cat')
      .where('cat.restaurant_id = :rid', { rid: restaurantId })
      .andWhere('mi.is_available = true')
      .getMany();

    if (!restaurantMenu || restaurantMenu.length === 0) return [];

    const globalItems = await this.getGlobalPersonalizedMenu(customerId, limit);

    const rankingMap = new Map<string, number>();
    for (let i = 0; i < globalItems.length; i++) {
      const it = globalItems[i];
      if (it && it.id) rankingMap.set(it.id, i);
    }

    restaurantMenu.sort((a: MenuItem, b: MenuItem) => {
      const aRank = rankingMap.has(a.id) ? (rankingMap.get(a.id) as number) : Number.MAX_SAFE_INTEGER;
      const bRank = rankingMap.has(b.id) ? (rankingMap.get(b.id) as number) : Number.MAX_SAFE_INTEGER;
      if (aRank === bRank) {
        return (a.name || '').localeCompare(b.name || '');
      }
      return aRank - bRank;
    });

    return restaurantMenu;
  }

  async invalidateGlobalCache(customerId: string): Promise<void> {
    try {
      await this.cacheManager.del(this.globalCacheKey(customerId));
    } catch (err) {
      this.logger.warn('Failed to invalidate personalized menu cache', err as any);
    }
  }
}
