import { Inject, Injectable, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { EntityManager } from 'typeorm';

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
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache, // This injects the Redis cache
  ) {}

  async performSearch(queryDto: SearchQuery): Promise<PaginatedSearchResult> {
    const { q, type = 'all', limit = 10, offset = 0 } = queryDto;

    if (!q || q.trim().length === 0) {
      return { results: [], total: 0 };
    }
    
    // 1. Create a unique key for this exact search
    const cacheKey = `search:${type}:${q}:${limit}:${offset}`;
    
    // 2. Try to get the result from the cache
    const cachedResult = await this.cacheManager.get<PaginatedSearchResult>(cacheKey);

    // 3. If a result is found in the cache, return it immediately!
    if (cachedResult) {
      this.logger.log(`Cache HIT for key: ${cacheKey}`);
      return cachedResult;
    }

    // 4. If nothing is in the cache, it's a "miss". We continue to the database.
    this.logger.log(`Cache MISS for key: ${cacheKey}. Querying database.`);
    
    // --- Your original database logic starts here ---
    const cleanedQuery = q.replace(/[^a-zA-Z0-9\s]+/g, ' ').trim();
    const formattedQuery = cleanedQuery.split(/\s+/).join(' & ') + ':*';

    let countQuery = '';
    let resultsQuery = '';
    const params = [formattedQuery, limit, offset];
    
    const restaurantSelect = `SELECT 'restaurant' AS result_type, r.id, r.name, r.address AS detail_one, (SELECT AVG(m.price)::NUMERIC(10,2)::TEXT FROM menu_items m JOIN menu_categories mc ON m.category_id = mc.id WHERE mc.restaurant_id = r.id) AS detail_two, r.rating FROM restaurants r WHERE r.document_tsvector @@ to_tsquery('english', $1)`;
    const itemSelect = `SELECT 'item' AS result_type, m.id, m.name, r.name AS detail_one, m.price::TEXT AS detail_two, r.rating FROM menu_items m JOIN menu_categories mc ON m.category_id = mc.id JOIN restaurants r ON mc.restaurant_id = r.id WHERE m.document_tsvector @@ to_tsquery('english', $1)`;

    if (type === 'restaurant') {
      countQuery = `SELECT COUNT(*) FROM (${restaurantSelect}) AS subquery`;
      resultsQuery = `${restaurantSelect} ORDER BY rating DESC NULLS LAST, ts_rank_cd(r.document_tsvector, to_tsquery('english', $1)) DESC LIMIT $2 OFFSET $3`;
    } else if (type === 'item') {
      countQuery = `SELECT COUNT(*) FROM (${itemSelect}) AS subquery`;
      resultsQuery = `${itemSelect} ORDER BY rating DESC NULLS LAST, ts_rank_cd(m.document_tsvector, to_tsquery('english', $1)) DESC LIMIT $2 OFFSET $3`;
    } else {
      const unionQuery = `${restaurantSelect} UNION ALL ${itemSelect}`;
      countQuery = `SELECT COUNT(*) FROM (${unionQuery}) AS subquery`;
      resultsQuery = `${unionQuery} ORDER BY rating DESC NULLS LAST LIMIT $2 OFFSET $3`;
    }

    try {
      const countResultPromise = this.entityManager.query(countQuery, [formattedQuery]);
      const resultsPromise = this.entityManager.query(resultsQuery, params);

      const [countResult, results] = await Promise.all([countResultPromise, resultsPromise]);

      const total = parseInt(countResult[0].count, 10);
      
      const finalResult = {
        total,
        results: results.map(item => ({...item, rating: parseFloat(item.rating) || 0 })),
      };

      // 5. IMPORTANT: Save the fresh database result to the cache for next time.
      await this.cacheManager.set(cacheKey, finalResult);

      return finalResult;

    } catch (error) {
      this.logger.error(`Failed to execute search for query: "${q}"`, error.stack);
      throw new Error('An error occurred while performing the search.');
    }
  }
}