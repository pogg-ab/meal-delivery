# Reviews & Rating Feature

## Overview
This feature allows customers to rate and review meals (menu items) they've ordered. Restaurant ratings are automatically derived from the average of all their meal ratings.

## Features
- ⭐ **Meal Reviews**: Customers can rate meals from 1-5 stars with optional comments
- 🏪 **Restaurant Ratings**: Automatically aggregated from all meal ratings
- ✅ **Verified Purchases**: Reviews linked to actual orders are marked as verified
- 🔄 **Real-time Updates**: Cached ratings update instantly on create/update/delete
- 📊 **Rating Statistics**: View rating distribution and analytics
- 🔒 **User Protection**: One review per customer per meal
- 📢 **Event-Driven**: Kafka events emitted for analytics service

## Database Schema

### Reviews Table
```sql
reviews
  - id (uuid, PK)
  - menu_item_id (uuid, FK → menu_items)
  - customer_id (uuid, indexed)
  - order_id (uuid, FK → orders, nullable)
  - rating (integer, 1-5, with CHECK constraint)
  - comment (text, nullable)
  - customer_name (varchar, cached for display)
  - is_verified_purchase (boolean)
  - created_at (timestamp)
  - updated_at (timestamp)
  - deleted_at (timestamp, for soft deletes)
  
Indexes:
  - menu_item_id (for fast meal review lookups)
  - customer_id (for user review history)
  - created_at (for sorting by recent)
  - UNIQUE(customer_id, menu_item_id) where deleted_at IS NULL
```

### Updated Tables
**menu_items**
- `average_rating` (decimal 3,2) - Cached average rating
- `total_reviews` (integer) - Cached review count

**restaurants**
- `average_rating` (decimal 3,2) - Derived from all meal ratings
- `total_reviews` (integer) - Total reviews across all meals

## API Endpoints

### 1. Create Review
**POST** `/reviews`
- **Auth**: Required (JWT)
- **Requirements**: 
  - User must have ordered this menu item
  - Order status must be valid (AWAITING_PAYMENT, PAID, or later stages)
  - User must not have already reviewed this item
- **Body**:
```json
{
  "menu_item_id": "uuid",
  "rating": 5,
  "comment": "Absolutely delicious!",
  "order_id": "uuid" // optional, will use any valid order if not specified
}
```
- **Response**: `201 Created` with ReviewResponseDto
- **Errors**:
  - `403 Forbidden` - Haven't ordered this meal with valid status
  - `409 Conflict` - Already reviewed this item
  - `404 Not Found` - Menu item or order not found
  - `400 Bad Request` - Invalid order status or menu item not in order

### 2. Update Review
**PUT** `/reviews/:id`
- **Auth**: Required (JWT)
- **Body**:
```json
{
  "rating": 4,
  "comment": "Updated review text"
}
```
- **Response**: `200 OK` with ReviewResponseDto
- **Errors**:
  - `403 Forbidden` - Not your review
  - `404 Not Found` - Review not found

### 3. Delete Review
**DELETE** `/reviews/:id`
- **Auth**: Required (JWT)
- **Response**: `204 No Content`
- **Errors**:
  - `403 Forbidden` - Not your review
  - `404 Not Found` - Review not found

### 4. Get Menu Item Reviews
**GET** `/reviews/menu-item/:menuItemId?page=1&limit=10`
- **Auth**: Public (no auth required)
- **Query Params**:
  - `page` (default: 1)
  - `limit` (default: 10)
- **Response**:
```json
{
  "menu_item_id": "uuid",
  "menu_item_name": "Doro Wat",
  "average_rating": 4.5,
  "total_reviews": 127,
  "rating_distribution": {
    "1": 2,
    "2": 5,
    "3": 15,
    "4": 35,
    "5": 70
  },
  "reviews": [
    {
      "id": "uuid",
      "menu_item_id": "uuid",
      "rating": 5,
      "comment": "Amazing!",
      "customer_name": "John Doe",
      "is_verified_purchase": true,
      "created_at": "2025-01-15T10:30:00Z",
      "updated_at": "2025-01-15T10:30:00Z"
    }
  ]
}
```

### 5. Get Restaurant Rating
**GET** `/reviews/restaurant/:restaurantId`
- **Auth**: Public (no auth required)
- **Response**:
```json
{
  "restaurant_id": "uuid",
  "restaurant_name": "Addis Kitchen",
  "average_rating": 4.3,
  "total_reviews": 523,
  "rating_distribution": {
    "1": 12,
    "2": 28,
    "3": 89,
    "4": 167,
    "5": 227
  }
}
```

### 6. Get My Reviews
**GET** `/reviews/my-reviews`
- **Auth**: Required (JWT)
- **Response**: Array of ReviewResponseDto

### 7. Check if Can Review
**GET** `/reviews/can-review/:menuItemId`
- **Auth**: Required (JWT)
- **Response**:
```json
{
  "can_review": true,
  "reason": null,
  "has_reviewed": false,
  "has_ordered": true
}
```
- **Use Case**: Frontend can check this before showing review form
- **Possible Reasons**:
  - `"You must order this meal before you can review it"`
  - `"You have already reviewed this item"`
  - `null` (if can review)

### 8. Menu Items with Ratings
**GET** `/menu-items/restaurant/:restaurantId`
- **Auth**: Public
- **Response**: Now includes `average_rating`, `total_reviews` for each menu item, plus `restaurantRating` and `restaurantTotalReviews`

## Business Rules

1. **One Review Per Customer Per Meal**: Customers can only review each meal once (enforced by unique constraint)
2. **Rating Range**: Only 1-5 stars allowed (enforced by CHECK constraint)
3. **Must Have Ordered the Meal**: Only customers who have ordered a specific meal can review it
4. **Valid Order Status Required**: Order must be in a valid status:
   - Currently allowed: `AWAITING_PAYMENT`, `PAID`, `PREPARING`, `READY`, `CUSTOMER_COMING`, `OUT_FOR_DELIVERY`, `DELIVERED`, `COMPLETED`
   - **Future**: After payment integration, will be restricted to `PAID` status only
   - This ensures only customers who actually received/will receive the meal can review
5. **Verified Purchases**: All reviews are verified purchases (since ordering is required)
6. **Own Reviews Only**: Customers can only update/delete their own reviews
7. **Soft Deletes**: Reviews are soft-deleted to maintain data integrity
8. **Auto-aggregation**: Ratings automatically update MenuItem and Restaurant cached values

## Caching Strategy

### Performance Optimization
Instead of calculating ratings on every request, we cache:
- `average_rating` on `menu_items` table
- `total_reviews` on `menu_items` table
- `average_rating` on `restaurants` table (derived from all meals)
- `total_reviews` on `restaurants` table

### Update Triggers
Cached values update automatically when:
- New review created
- Review updated
- Review deleted

### Calculation Method
```typescript
average_rating = SUM(rating) / COUNT(*) // rounded to 1 decimal
restaurant_rating = AVG(all_meal_ratings_in_restaurant)
```

## Kafka Events

Events emitted to Kafka for analytics:

### review.created
```json
{
  "review_id": "uuid",
  "menu_item_id": "uuid",
  "customer_id": "uuid",
  "rating": 5,
  "is_verified_purchase": true,
  "created_at": "2025-01-15T10:30:00Z"
}
```

### review.updated
```json
{
  "review_id": "uuid",
  "menu_item_id": "uuid",
  "customer_id": "uuid",
  "rating": 4,
  "updated_at": "2025-01-15T12:00:00Z"
}
```

### review.deleted
```json
{
  "review_id": "uuid",
  "menu_item_id": "uuid",
  "customer_id": "uuid",
  "deleted_at": "2025-01-15T14:00:00Z"
}
```

## Migration Instructions

### 1. Run Migrations
```bash
cd catalog-service
npm run build
npm run typeorm migration:run
```

This will create:
- `reviews` table with all constraints and indexes
- `average_rating` and `total_reviews` columns on `menu_items`
- `average_rating` and `total_reviews` columns on `restaurants`

### 2. Backfill Existing Data (if needed)
If you have existing data, you may want to calculate initial ratings:

```sql
-- Update menu item ratings
UPDATE menu_items mi
SET 
  average_rating = (
    SELECT ROUND(AVG(r.rating)::numeric, 2)
    FROM reviews r
    WHERE r.menu_item_id = mi.id AND r.deleted_at IS NULL
  ),
  total_reviews = (
    SELECT COUNT(*)
    FROM reviews r
    WHERE r.menu_item_id = mi.id AND r.deleted_at IS NULL
  );

-- Update restaurant ratings
UPDATE restaurants rest
SET 
  average_rating = (
    SELECT ROUND(AVG(r.rating)::numeric, 2)
    FROM reviews r
    INNER JOIN menu_items mi ON r.menu_item_id = mi.id
    INNER JOIN menu_categories mc ON mi.category_id = mc.id
    WHERE mc.restaurant_id = rest.id AND r.deleted_at IS NULL
  ),
  total_reviews = (
    SELECT COUNT(*)
    FROM reviews r
    INNER JOIN menu_items mi ON r.menu_item_id = mi.id
    INNER JOIN menu_categories mc ON mi.category_id = mc.id
    WHERE mc.restaurant_id = rest.id AND r.deleted_at IS NULL
  );
```

## Mobile App Integration

### Meal Detail Page Flow
1. **Fetch Menu Item** with ratings:
   ```
   GET /menu-items/restaurant/:restaurantId
   ```
   Response includes `average_rating` and `total_reviews` for each meal

2. **Check if User Can Review** (for authenticated users):
   ```
   GET /reviews/can-review/:menuItemId
   ```
   Returns `can_review`, `has_ordered`, `has_reviewed`, and reason if cannot review
   
   **Frontend Logic**:
   - If `can_review: false` → Don't show review button/form
   - If `has_reviewed: true` → Show "Edit Review" button instead
   - If `has_ordered: false` → Don't show review section at all

3. **Fetch Reviews** for the meal:
   ```
   GET /reviews/menu-item/:menuItemId?page=1&limit=10
   ```
   Shows rating distribution, statistics, and paginated reviews with customer names

4. **Create Review** (only after ordering and checking can_review):
   ```
   POST /reviews
   Body: { menu_item_id, rating, comment, order_id }
   ```
   Note: `order_id` is optional; system will use any valid order

### Restaurant Page Flow
1. **Fetch Restaurant Rating**:
   ```
   GET /reviews/restaurant/:restaurantId
   ```
   Shows overall restaurant rating derived from all meals

### My Reviews Page
1. **Fetch User's Reviews**:
   ```
   GET /reviews/my-reviews
   ```

2. **Update Review**:
   ```
   PUT /reviews/:reviewId
   ```

3. **Delete Review**:
   ```
   DELETE /reviews/:reviewId
   ```

## Testing Checklist

- [ ] Create review with valid order (AWAITING_PAYMENT status)
- [ ] Create review with valid order (PAID status)
- [ ] Create review with valid order (COMPLETED status)
- [ ] Attempt review without ordering meal (should fail with 403)
- [ ] Attempt review with invalid order status like PENDING or CANCELLED (should fail)
- [ ] Attempt duplicate review (should fail with 409)
- [ ] Update own review
- [ ] Attempt to update someone else's review (should fail with 403)
- [ ] Delete own review
- [ ] Check can_review endpoint before ordering (should return false)
- [ ] Check can_review endpoint after ordering (should return true)
- [ ] Check can_review endpoint after already reviewed (should return false)
- [ ] Verify ratings update on MenuItem
- [ ] Verify ratings update on Restaurant
- [ ] Verify customer_id is not exposed in public responses
- [ ] Fetch menu item reviews with pagination
- [ ] Fetch restaurant rating
- [ ] Verify Kafka events are emitted
- [ ] Check rating distribution calculations
- [ ] Verify soft delete behavior

## Security Considerations

1. **Authentication**: Review creation/update/delete requires JWT auth
2. **Authorization**: Users can only modify their own reviews
3. **Order Verification**: Only customers who ordered the meal can review it
4. **Status Validation**: Order must be in valid status (prevents review spam on cancelled orders)
5. **Input Validation**: Class-validator DTOs prevent invalid data
6. **Privacy**: Customer IDs are not exposed in public review responses (only customer_name)
7. **Rate Limiting**: Consider adding rate limits to prevent spam reviews
8. **Content Moderation**: Future enhancement - flag inappropriate comments

## Performance Considerations

1. **Indexes**: Optimized for common queries (menu_item_id, customer_id, created_at)
2. **Cached Ratings**: Avoid recalculating on every read
3. **Pagination**: Review lists are paginated to prevent large payloads
4. **Soft Deletes**: Maintains referential integrity without cascade deletes

## Future Enhancements

- [ ] Review moderation/flagging system
- [ ] Review helpful votes (thumbs up/down)
- [ ] Photo attachments to reviews
- [ ] Restaurant owner responses to reviews
- [ ] Review sentiment analysis
- [ ] Review rewards/badges for frequent reviewers
- [ ] Sorting options (most helpful, recent, highest/lowest rating)
- [ ] Review editing history/audit trail
