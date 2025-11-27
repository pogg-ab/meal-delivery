import { MigrationInterface, QueryRunner } from "typeorm";

export class AddMinScheduleLeadTimeToRestaurant1764228715243 implements MigrationInterface {
    name = 'AddMinScheduleLeadTimeToRestaurant1764228715243'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."idx_order_items_menu_item_id"`);
        await queryRunner.query(`DROP INDEX "public"."idx_orders_restaurant_id_created_at"`);
        await queryRunner.query(`DROP INDEX "public"."idx_orders_status"`);
        await queryRunner.query(`ALTER TABLE "restaurants" ADD "minimumSchedulingLeadTimeMinutes" integer NOT NULL DEFAULT '45'`);
        await queryRunner.query(`COMMENT ON COLUMN "restaurants"."minimumSchedulingLeadTimeMinutes" IS 'The minimum lead time in minutes required for a customer to schedule an order.'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`COMMENT ON COLUMN "restaurants"."minimumSchedulingLeadTimeMinutes" IS 'The minimum lead time in minutes required for a customer to schedule an order.'`);
        await queryRunner.query(`ALTER TABLE "restaurants" DROP COLUMN "minimumSchedulingLeadTimeMinutes"`);
        await queryRunner.query(`CREATE INDEX "idx_orders_status" ON "orders" ("status") `);
        await queryRunner.query(`CREATE INDEX "idx_orders_restaurant_id_created_at" ON "orders" ("created_at", "restaurant_id") `);
        await queryRunner.query(`CREATE INDEX "idx_order_items_menu_item_id" ON "order_items" ("menu_item_id") `);
    }

}
