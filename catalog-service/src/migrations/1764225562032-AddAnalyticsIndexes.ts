import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAnalyticsIndexes1764225562032 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE INDEX idx_orders_restaurant_id_created_at 
            ON "orders" ("restaurant_id", "created_at" DESC)
        `);

        // Speeds up queries that filter by order status (e.g., finding all COMPLETED orders).
        await queryRunner.query(`
            CREATE INDEX idx_orders_status 
            ON "orders" ("status")
        `);

        await queryRunner.query(`
            CREATE INDEX idx_order_items_menu_item_id
            ON "order_items" ("menu_item_id")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop indexes in the reverse order of creation
        await queryRunner.query(`DROP INDEX IF EXISTS idx_order_items_menu_item_id`);
        await queryRunner.query(`DROP INDEX IF EXISTS idx_orders_status`);
        await queryRunner.query(`DROP INDEX IF EXISTS idx_orders_restaurant_id_created_at`);
    }
}