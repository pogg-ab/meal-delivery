import { Inject, Injectable, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { EntityManager, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Restaurant } from 'src/entities/restaurant.entity';
import { SearchRestaurantsDto } from './dto/search-restaurants.dto';

interface SearchQuery {
  q: string;
  type?: 'all' | 'restaurant' | 'item';
  limit?: number;
  offset?: number;
}

export interface PaginatedSearchResult {
  results: any[];
  total: number;
}

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    private readonly entityManager: EntityManager,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    @InjectRepository(Restaurant)
    private readonly restaurantRepository: Repository<Restaurant>,
  ) {}


  async performSearch(queryDto: SearchQuery): Promise<PaginatedSearchResult> {
    const { q, type = 'all', limit = 10, offset = 0 } = queryDto;
    if (!q || q.trim().length === 0) { return { results: [], total: 0 }; }
    
    const cacheKey = `search-v2:${type}:${q}:${limit}:${offset}`;
    const cachedResult = await this.cacheManager.get<PaginatedSearchResult>(cacheKey);
    if (cachedResult) {
      this.logger.log(`Cache HIT for key: ${cacheKey}`);
      return cachedResult;
    }
    this.logger.log(`Cache MISS for key: ${cacheKey}. Querying database.`);
    
    const searchQuery = `%${q.trim()}%`;
    let countQuery = '';
    let resultsQuery = '';
    const params = [searchQuery];
    
    // --- THIS IS THE FIX: Added 'NULL AS detail_two' to match the column count ---
    const restaurantSelect = `SELECT 'restaurant' AS result_type, id, name, street AS detail_one, NULL AS detail_two FROM restaurants WHERE name ILIKE $1`;
    const itemSelect = `SELECT 'item' AS result_type, m.id, m.name, r.name AS detail_one, m.price::TEXT AS detail_two FROM menu_items m JOIN menu_categories mc ON m.category_id = mc.id JOIN restaurants r ON mc.restaurant_id = r.id WHERE m.name ILIKE $1`;

    if (type === 'restaurant') {
      countQuery = `SELECT COUNT(*) FROM (${restaurantSelect}) AS subquery`;
      resultsQuery = `${restaurantSelect} ORDER BY name ASC LIMIT $2 OFFSET $3`;
    } else if (type === 'item') {
      countQuery = `SELECT COUNT(*) FROM (${itemSelect}) AS subquery`;
      resultsQuery = `${itemSelect} ORDER BY name ASC LIMIT $2 OFFSET $3`;
    } else { // 'all'
      const unionQuery = `${restaurantSelect} UNION ALL ${itemSelect}`;
      countQuery = `SELECT COUNT(*) FROM (${unionQuery}) AS subquery`;
      resultsQuery = `${unionQuery} ORDER BY name ASC LIMIT $2 OFFSET $3`;
    }

    const resultsParams = [searchQuery, limit, offset];

    try {
      const [countResult, results] = await Promise.all([
        this.entityManager.query(countQuery, params),
        this.entityManager.query(resultsQuery, resultsParams)
      ]);
      const total = parseInt(countResult[0].count, 10);
      
      const finalResult = {
        total,
        results: results,
      };

      await this.cacheManager.set(cacheKey, finalResult, 60 * 1000);
      return finalResult;
    } catch (error) {
      this.logger.error(`Failed to execute search for query: "${q}"`, error.stack);
      throw new Error('An error occurred while performing the search.');
    }
  }
  async searchByLocation(queryDto: SearchRestaurantsDto) {
    const { latitude, longitude, radius, page, limit, minRating } = queryDto;

    const lat_rnd = latitude.toFixed(3);
    const lon_rnd = longitude.toFixed(3);
    const cacheKey = `search-location:${lat_rnd}:${lon_rnd}:rad${radius}:p${page}:l${limit}:minR${minRating || 0}`;

    try {
      const cachedResult = await this.cacheManager.get(cacheKey);
      if (cachedResult) {
        this.logger.log(`Cache HIT for location search: ${cacheKey}`);
        return cachedResult;
      }

      this.logger.log(`Cache MISS for location search: ${cacheKey}`);
      
      const meters = radius * 1000;
      const offset = (page - 1) * limit;

      const baseQuery = this.restaurantRepository.createQueryBuilder('restaurant')
        .where(
          `ST_DWithin(
            geography(ST_MakePoint(restaurant.longitude, restaurant.latitude)),
            geography(ST_MakePoint(:lon, :lat)),
            :radiusInMeters
          )`,
          {
            lon: longitude,
            lat: latitude,
            radiusInMeters: meters,
          }
        );

      if (minRating !== undefined) {
        baseQuery.andWhere('restaurant.rating >= :minRating', { minRating });
      }
      
      const total = await baseQuery.getCount();

      const results = await baseQuery
        .addSelect(
          `ST_Distance(
            geography(ST_MakePoint(restaurant.longitude, restaurant.latitude)),
            geography(ST_MakePoint(:lon, :lat))
          ) / 1000`,
          'distance_km'
        )
        .orderBy('distance_km', 'ASC')
        .skip(offset)
        .take(limit)
        .getRawMany();

      const formattedResults = results.map(r => ({
        id: r.restaurant_id,
        name: r.restaurant_name,
        description: r.restaurant_description,
        street: r.restaurant_street,
        city: r.restaurant_city,
        isActive: r.restaurant_is_active,
        distanceKm: parseFloat(r.distance_km).toFixed(2),
      }));

      const finalResult = {
        data: formattedResults,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      };

      // --- THIS IS THE FINAL, CRITICAL FIX ---
      // The TTL must be in milliseconds. 300 * 1000 = 5 minutes.
      await this.cacheManager.set(cacheKey, finalResult, 300 * 1000);

      return finalResult;

    } catch (error) {
      this.logger.error(`Failed to execute location search for coords: (${latitude}, ${longitude})`, error.stack);
      throw new Error('An error occurred while performing the location search.');
    }
  }
}