import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Restaurant } from '../../entities/restaurant.entity';
import { GetRestaurantsQueryDto } from './dtos/get-restaurants-query.dto';

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

  // Simple query builder WITHOUT joins — returns only restaurant columns
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

  // order by name
  qb.orderBy('r.name', 'ASC');

  qb.skip(offset).take(limit);

  const [items, total] = await qb.getManyAndCount();

  // items are plain Restaurant entities (no relations loaded)
  return {
    data: items,
    meta: { total, page, limit },
  };
 }
}
