import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateMVDailyRestaurantRevenue1764224106488 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            -- Create the Materialized View to pre-calculate daily revenue and orders per restaurant
            CREATE MATERIALIZED VIEW mv_daily_restaurant_revenue AS
            SELECT
                r.id AS restaurant_id,
                r.name AS restaurant_name,
                DATE(o.created_at) AS summary_date,
                SUM(o.total_amount) AS total_revenue,
                COUNT(o.id) AS total_orders
            FROM
                restaurants r
            LEFT JOIN
                orders o ON r.id = o.restaurant_id AND o.status = 'COMPLETED'
            GROUP BY
                r.id, r.name, DATE(o.created_at)
            WITH DATA;
        `);

        await queryRunner.query(`
            -- Create a unique index on the view to make lookups extremely fast
            CREATE UNIQUE INDEX idx_mv_daily_restaurant_revenue_restaurant_date 
            ON mv_daily_restaurant_revenue(restaurant_id, summary_date);
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DROP MATERIALIZED VIEW IF EXISTS mv_daily_restaurant_revenue;
        `);
    }

}