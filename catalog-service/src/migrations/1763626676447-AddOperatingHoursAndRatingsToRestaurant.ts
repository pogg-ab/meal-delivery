import { MigrationInterface, QueryRunner } from "typeorm";

export class AddOperatingHoursAndRatingsToRestaurant1763626676447 implements MigrationInterface {
    name = 'AddOperatingHoursAndRatingsToRestaurant1763626676447'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_restaurants_average_rating"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_menu_items_average_rating"`);
        await queryRunner.query(`ALTER TABLE "reviews" DROP CONSTRAINT "CHK_reviews_rating"`);
        await queryRunner.query(`COMMENT ON COLUMN "restaurants"."average_rating" IS NULL`);
        await queryRunner.query(`COMMENT ON COLUMN "restaurants"."total_reviews" IS NULL`);
        await queryRunner.query(`COMMENT ON COLUMN "menu_items"."average_rating" IS NULL`);
        await queryRunner.query(`COMMENT ON COLUMN "menu_items"."total_reviews" IS NULL`);
        await queryRunner.query(`ALTER TABLE "reviews" DROP CONSTRAINT "FK_e4b0ed40bdd0f318108612c2851"`);
        await queryRunner.query(`COMMENT ON COLUMN "reviews"."order_id" IS NULL`);
        await queryRunner.query(`COMMENT ON COLUMN "reviews"."rating" IS NULL`);
        await queryRunner.query(`COMMENT ON COLUMN "reviews"."customer_name" IS NULL`);
        await queryRunner.query(`COMMENT ON COLUMN "reviews"."is_verified_purchase" IS NULL`);
        await queryRunner.query(`ALTER TABLE "reviews" ALTER COLUMN "created_at" SET DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "reviews" ALTER COLUMN "updated_at" SET DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "reviews" ADD CONSTRAINT "FK_e4b0ed40bdd0f318108612c2851" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "reviews" DROP CONSTRAINT "FK_e4b0ed40bdd0f318108612c2851"`);
        await queryRunner.query(`ALTER TABLE "reviews" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "reviews" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP`);
        await queryRunner.query(`COMMENT ON COLUMN "reviews"."is_verified_purchase" IS 'True if review is linked to an actual order'`);
        await queryRunner.query(`COMMENT ON COLUMN "reviews"."customer_name" IS 'Cached customer name for display'`);
        await queryRunner.query(`COMMENT ON COLUMN "reviews"."rating" IS 'Rating from 1 to 5'`);
        await queryRunner.query(`COMMENT ON COLUMN "reviews"."order_id" IS 'Reference to the order (optional, for verified purchases)'`);
        await queryRunner.query(`ALTER TABLE "reviews" ADD CONSTRAINT "FK_e4b0ed40bdd0f318108612c2851" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`COMMENT ON COLUMN "menu_items"."total_reviews" IS 'Cached total number of reviews for this menu item'`);
        await queryRunner.query(`COMMENT ON COLUMN "menu_items"."average_rating" IS 'Cached average rating for this menu item'`);
        await queryRunner.query(`COMMENT ON COLUMN "restaurants"."total_reviews" IS 'Cached total number of reviews across all menu items'`);
        await queryRunner.query(`COMMENT ON COLUMN "restaurants"."average_rating" IS 'Cached average rating derived from all menu item ratings'`);
        await queryRunner.query(`ALTER TABLE "reviews" ADD CONSTRAINT "CHK_reviews_rating" CHECK (((rating >= 1) AND (rating <= 5)))`);
        await queryRunner.query(`CREATE INDEX "IDX_menu_items_average_rating" ON "menu_items" ("average_rating") `);
        await queryRunner.query(`CREATE INDEX "IDX_restaurants_average_rating" ON "restaurants" ("average_rating") `);
    }

}
