# 📊 Analytics API Documentation

**Base URL**: `http://<catalog-service-host>:3001`
**Authentication**: All endpoints require a valid Bearer Token (`Authorization: Bearer <token>`).

---

## 🏪 Restaurant Analytics (Owner Dashboard)
*Access restricted to the owner of the specific restaurant.*

### 1. Get Restaurant Summary
**GET** `/analytics/restaurant/{restaurantId}/summary`

Returns high-level key performance indicators (KPIs) for the last 30 days.

*   **Path Parameters**:
    *   `restaurantId` (UUID): The ID of the restaurant.
*   **Response** (`200 OK`):
    ```json
    {
      "totalRevenue": 15780.50,
      "totalOrders": 850,
      "averageOrderValue": 18.57
    }
    ```

### 2. Get Order Volume Trends
**GET** `/analytics/restaurant/{restaurantId}/orders/trends`

Returns a daily time-series of completed order counts.

*   **Path Parameters**:
    *   `restaurantId` (UUID): The ID of the restaurant.
*   **Query Parameters**:
    *   `period` (Optional): `7d`, `30d` (default), or `90d`.
*   **Response** (`200 OK`):
    ```json
    [
      {
        "date": "2025-11-20",
        "orderCount": 12
      },
      {
        "date": "2025-11-21",
        "orderCount": 15
      }
    ]
    ```

### 3. Get Revenue Trends
**GET** `/analytics/restaurant/{restaurantId}/revenue/trends`

Returns a daily time-series of total revenue generated.

*   **Path Parameters**:
    *   `restaurantId` (UUID): The ID of the restaurant.
*   **Query Parameters**:
    *   `period` (Optional): `7d`, `30d` (default), or `90d`.
*   **Response** (`200 OK`):
    ```json
    [
      {
        "date": "2025-11-20",
        "totalRevenue": 450.00
      },
      {
        "date": "2025-11-21",
        "totalRevenue": 520.50
      }
    ]
    ```

### 4. Get Top Selling Meals
**GET** `/analytics/restaurant/{restaurantId}/top-meals`

Returns a ranked list of the most popular menu items by quantity sold.

*   **Path Parameters**:
    *   `restaurantId` (UUID): The ID of the restaurant.
*   **Query Parameters**:
    *   `limit` (Optional): Number of items to return (Default: 5, Max: 20).
*   **Response** (`200 OK`):
    ```json
    [
      {
        "mealId": "uuid-meal-1",
        "mealName": "Classic Cheeseburger",
        "quantitySold": 152
      },
      {
        "mealId": "uuid-meal-2",
        "mealName": "Fries",
        "quantitySold": 120
      }
    ]
    ```

### 5. Get Top Customers
**GET** `/analytics/restaurant/{restaurantId}/customers/top`

Returns a list of customers who have placed the most orders at this restaurant.

*   **Path Parameters**:
    *   `restaurantId` (UUID): The ID of the restaurant.
*   **Query Parameters**:
    *   `limit` (Optional): Number of customers to return (Default: 5).
*   **Response** (`200 OK`):
    ```json
    [
      {
        "customerId": "uuid-user-1",
        "customerName": "Jane Smith",
        "orderCount": 12
      }
    ]
    ```

### 6. Get Delivery Performance
**GET** `/analytics/restaurant/{restaurantId}/delivery-performance`

Returns metrics on operational efficiency, specifically food preparation time.

*   **Path Parameters**:
    *   `restaurantId` (UUID): The ID of the restaurant.
*   **Response** (`200 OK`):
    ```json
    {
      "averagePreparationTimeMinutes": 15.7
    }
    ```
    *Note: Measures time from order status `PREPARING` to `READY`.*

### 7. Get Cancellation Stats
**GET** `/analytics/restaurant/{restaurantId}/cancellations`

Returns statistics on cancelled orders to help identify issues.

*   **Path Parameters**:
    *   `restaurantId` (UUID): The ID of the restaurant.
*   **Response** (`200 OK`):
    ```json
    {
      "totalCancellations": 5,
      "cancellationRate": 0.048,
      "mostCancelledMeal": {
        "mealId": "uuid-meal-1",
        "mealName": "Spicy Tuna Roll",
        "cancellationCount": 3
      }
    }
    ```
    *Note: `mostCancelledMeal` is `null` if there are no cancellations.*

---

## 🛡️ Admin Analytics (Platform Dashboard)
*Access restricted to users with the `platform_admin` role.*

### 8. Get Platform Summary
**GET** `/analytics/admin/summary`

Returns high-level KPIs for the entire platform (last 30 days).

*   **Response** (`200 OK`):
    ```json
    {
      "totalPlatformRevenue": 125430.50,
      "totalPlatformOrders": 8550
    }
    ```

### 9. Get Top Performing Restaurants
**GET** `/analytics/admin/top-restaurants`

Returns a ranked list of restaurants generating the most revenue.

*   **Query Parameters**:
    *   `limit` (Optional): Default 5.
*   **Response** (`200 OK`):
    ```json
    [
      {
        "restaurantId": "uuid-rest-1",
        "restaurantName": "The Gourmet Kitchen",
        "totalRevenue": 15200.50
      }
    ]
    ```

### 10. Get Low Performing Restaurants
**GET** `/analytics/admin/low-performing-restaurants`

Returns a list of restaurants with the lowest revenue.

*   **Query Parameters**:
    *   `limit` (Optional): Default 5.
*   **Response** (`200 OK`):
    ```json
    [
      {
        "restaurantId": "uuid-rest-99",
        "restaurantName": "Quiet Cafe",
        "totalRevenue": 120.00
      }
    ]
    ```

### 11. Get Platform Top Meals
**GET** `/analytics/admin/top-meals`

Returns the most popular meals across the entire app.

*   **Query Parameters**:
    *   `limit` (Optional): Default 5.
*   **Response** (`200 OK`):
    ```json
    [
      {
        "mealId": "uuid-meal-5",
        "mealName": "Chicken Wings",
        "quantitySold": 5000
      }
    ]
    ```

### 12. Get Platform Order Trends
**GET** `/analytics/admin/orders/trends`

Returns daily order volume for the whole platform.

*   **Query Parameters**:
    *   `period` (Optional): `7d`, `30d`, `90d`.
*   **Response** (`200 OK`):
    ```json
    [
      {
        "date": "2025-11-25",
        "orderCount": 350
      }
    ]
    ```

### 13. Get Payment Health
**GET** `/analytics/admin/payment-health`

Returns statistics on payment success vs. failure rates.

*   **Response** (`200 OK`):
    ```json
    {
      "successfulPayments": 8450,
      "failedPayments": 120,
      "successRate": 0.985
    }
    ```
