import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Restaurant } from '../../entities/restaurant.entity';
import { GetRestaurantsQueryDto } from './dtos/get-restaurants-query.dto';
import { UpdateScheduleSettingsDto } from './dtos/update-schedule-settings.dto';

@Injectable()
export class RestaurantsService {
  constructor(
    @InjectRepository(Restaurant)
    private readonly restaurantRepository: Repository<Restaurant>,
  ) {}

  async findAll(
    query: GetRestaurantsQueryDto,
  ): Promise<{ data: Restaurant[]; meta: { total: number; page: number; limit: number } }> {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit && query.limit > 0 ? Math.min(query.limit, 100) : 20;
    const offset = (page - 1) * limit;

    const qb = this.restaurantRepository.createQueryBuilder('r');

    // search by name (ILIKE)
    if (query.search && String(query.search).trim().length > 0) {
      qb.andWhere('r.name ILIKE :q', { q: `%${String(query.search).trim()}%` });
    }

    // is_active: accept boolean or boolean-string
    if (typeof query.is_active !== 'undefined' && query.is_active !== null) {
      let isActive: boolean;
      if (typeof query.is_active === 'boolean') {
        isActive = query.is_active;
      } else {
        const s = String(query.is_active).toLowerCase();
        isActive = s === 'true' || s === '1';
      }
      qb.andWhere('r.is_active = :isActive', { isActive });
    }

    // --- NEW FILTER LOGIC ADDED HERE ---
    if (typeof query.min_rating !== 'undefined' && query.min_rating !== null) {
      // The DTO ensures this is a number between 0 and 5
      qb.andWhere('r.average_rating >= :minRating', { minRating: query.min_rating });
    }
    // ---------------------------------

    // order by name
    qb.orderBy('r.name', 'ASC');

    qb.skip(offset).take(limit);

    const [items, total] = await qb.getManyAndCount();

    return {
      data: items,
      meta: { total, page, limit },
    };
  }

  async updateScheduleSettings(
    restaurantId: string,
    ownerId: string,
    dto: UpdateScheduleSettingsDto,
  ): Promise<Restaurant> {
    const restaurant = await this.restaurantRepository.findOneBy({ id: restaurantId, owner_id: ownerId });

    if (!restaurant) {
      // Use a generic error to avoid leaking information about which restaurant IDs exist
      throw new NotFoundException('Restaurant not found or you do not have permission to access it.');
    }

    restaurant.minimumSchedulingLeadTimeMinutes = dto.minimumSchedulingLeadTimeMinutes;

    return this.restaurantRepository.save(restaurant);
  }
}
