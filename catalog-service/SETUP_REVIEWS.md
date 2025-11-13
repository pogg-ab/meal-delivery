# Quick Setup Guide - Reviews Feature

## Prerequisites
- PostgreSQL database running for catalog-service
- Kafka running
- Auth-service running (for JWT authentication)

## Installation Steps

### 1. Navigate to catalog-service
```powershell
cd c:\Users\hp\meal-delivery\catalog-service
```

### 2. Install dependencies (if not already installed)
```powershell
npm install
```

### 3. Build the project
```powershell
npm run build
```

### 4. Run migrations
```powershell
# Using TypeORM CLI
npx typeorm migration:run -d dist/data-source.js

# Or if you have a npm script
npm run typeorm migration:run
```

This will create:
- `reviews` table
- Add `average_rating` and `total_reviews` to `menu_items`
- Add `average_rating` and `total_reviews` to `restaurants`

### 5. Start the service
```powershell
# Development mode
npm run start:dev

# Production mode
npm run start:prod
```

The catalog-service will be available at `http://localhost:8001`

## Verify Installation

### Check Database
```sql
-- Connect to catalog database
psql -h localhost -p 5433 -U postgres -d catalog

-- Verify reviews table exists
\dt reviews

-- Check structure
\d reviews

-- Verify columns added to menu_items
\d menu_items

-- Verify columns added to restaurants
\d restaurants
```

### Test API Endpoints

#### 1. Create a review (requires authentication)
```bash
curl -X POST http://localhost:8001/reviews \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "menu_item_id": "your-menu-item-uuid",
    "rating": 5,
    "comment": "Absolutely delicious!"
  }'
```

#### 2. Get menu item reviews (public)
```bash
curl http://localhost:8001/reviews/menu-item/your-menu-item-uuid
```

#### 3. Get restaurant rating (public)
```bash
curl http://localhost:8001/reviews/restaurant/your-restaurant-uuid
```

#### 4. Get menu items with ratings
```bash
curl http://localhost:8001/menu-items/restaurant/your-restaurant-uuid
```

## Environment Variables

Ensure your `.env` file in catalog-service has:
```env
# Database
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=catalog

# Kafka
KAFKA_BROKER=localhost:9092
KAFKA_GROUP_ID=catalog-consumer

# JWT
JWT_SECRET=your-secret-key

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
```

## Swagger Documentation

Once the service is running, access Swagger UI at:
```
http://localhost:8001/api
```

You'll see all review endpoints documented with:
- Request/response schemas
- Authentication requirements
- Try-it-out functionality

## Common Issues & Solutions

### Issue: Migration fails
**Solution**: Check if TypeORM is configured properly in `data-source.js` or `ormconfig.js`

### Issue: "Cannot find module" errors
**Solution**: Run `npm install` again and ensure all dependencies are installed

### Issue: JWT authentication not working
**Solution**: 
1. Ensure auth-service is running
2. Get a valid JWT token from auth-service login endpoint
3. Include it in Authorization header: `Bearer YOUR_TOKEN`

### Issue: Kafka events not emitting
**Solution**: 
1. Ensure Kafka and Zookeeper are running
2. Check `KAFKA_BROKER` environment variable
3. Check catalog-service logs for Kafka connection errors

## Testing

### Run unit tests
```powershell
npm test
```

### Run specific test file
```powershell
npm test reviews.service.spec.ts
```

### Run with coverage
```powershell
npm run test:cov
```

## Docker Setup

If using Docker Compose from the root:

```powershell
# From meal-delivery root
cd c:\Users\hp\meal-delivery

# Build and start all services
docker-compose up --build

# Run migrations inside container
docker-compose exec catalog-service npm run typeorm migration:run
```

## Next Steps

1. **Frontend Integration**: Use the documented API endpoints in your mobile app
2. **Analytics**: Analytics-service can consume Kafka events (`review.created`, `review.updated`, `review.deleted`)
3. **Moderation**: Add review flagging/moderation endpoints
4. **Testing**: Add more test coverage for edge cases
5. **Performance**: Monitor query performance and add indexes if needed

## Support

For issues or questions:
1. Check `REVIEWS_FEATURE.md` for detailed documentation
2. Review test files for usage examples
3. Check Swagger UI for API documentation
4. Review service logs for error details
