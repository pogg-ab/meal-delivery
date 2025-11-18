import { MigrationInterface, QueryRunner } from "typeorm";

export class AddScheduledOrdersAndJobs1763119806494 implements MigrationInterface {
    name = 'AddScheduledOrdersAndJobs1763119806494'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "customer_menu_ranking" DROP CONSTRAINT "fk_customer_menu_ranking_menu_item"`);
        await queryRunner.query(`DROP INDEX "public"."restaurants_document_tsvector_idx"`);
        await queryRunner.query(`DROP INDEX "public"."idx_customer_menu_unique"`);
        await queryRunner.query(`CREATE TYPE "public"."scheduled_jobs_status_enum" AS ENUM('pending', 'processed', 'failed')`);
        await queryRunner.query(`CREATE TABLE "scheduled_jobs" ("id" SERIAL NOT NULL, "run_at" TIMESTAMP WITH TIME ZONE NOT NULL, "status" "public"."scheduled_jobs_status_enum" NOT NULL DEFAULT 'pending', "last_attempt" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "order_id" uuid NOT NULL, CONSTRAINT "REL_bab32c12b28f20bb68751a9d69" UNIQUE ("order_id"), CONSTRAINT "PK_119312a5470a95ee9c733a5246d" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_scheduled_jobs_run_at" ON "scheduled_jobs" ("run_at") `);
        await queryRunner.query(`ALTER TABLE "restaurants" DROP COLUMN "document_tsvector"`);
        await queryRunner.query(`ALTER TABLE "menu_items" DROP COLUMN "document_tsvector"`);
        await queryRunner.query(`ALTER TABLE "orders" ADD "is_scheduled" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`COMMENT ON COLUMN "orders"."is_scheduled" IS 'Flag to indicate if the order is scheduled for future delivery'`);
        await queryRunner.query(`ALTER TABLE "orders" ADD "scheduled_delivery_time" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`COMMENT ON COLUMN "orders"."scheduled_delivery_time" IS 'The specific time the scheduled order should be delivered'`);
        await queryRunner.query(`ALTER TABLE "order_events" DROP CONSTRAINT "FK_b33cbf9a59cbee112d94bcb59de"`);
        await queryRunner.query(`ALTER TABLE "order_events" ALTER COLUMN "order_id" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "customer_menu_ranking" ALTER COLUMN "created_at" SET DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "customer_menu_ranking" ALTER COLUMN "updated_at" SET DEFAULT now()`);
        await queryRunner.query(`CREATE INDEX "idx_orders_scheduled_delivery_time" ON "orders" ("scheduled_delivery_time") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_1b06f0382a09a4a625dadc9d33" ON "customer_menu_ranking" ("customer_id", "menu_item_id") `);
        await queryRunner.query(`ALTER TABLE "order_events" ADD CONSTRAINT "FK_b33cbf9a59cbee112d94bcb59de" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "scheduled_jobs" ADD CONSTRAINT "FK_bab32c12b28f20bb68751a9d69d" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "customer_menu_ranking" ADD CONSTRAINT "FK_a00026a449abd8722442dddd71e" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "customer_menu_ranking" DROP CONSTRAINT "FK_a00026a449abd8722442dddd71e"`);
        await queryRunner.query(`ALTER TABLE "scheduled_jobs" DROP CONSTRAINT "FK_bab32c12b28f20bb68751a9d69d"`);
        await queryRunner.query(`ALTER TABLE "order_events" DROP CONSTRAINT "FK_b33cbf9a59cbee112d94bcb59de"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_1b06f0382a09a4a625dadc9d33"`);
        await queryRunner.query(`DROP INDEX "public"."idx_orders_scheduled_delivery_time"`);
        await queryRunner.query(`ALTER TABLE "customer_menu_ranking" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "customer_menu_ranking" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "order_events" ALTER COLUMN "order_id" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "order_events" ADD CONSTRAINT "FK_b33cbf9a59cbee112d94bcb59de" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`COMMENT ON COLUMN "orders"."scheduled_delivery_time" IS 'The specific time the scheduled order should be delivered'`);
        await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "scheduled_delivery_time"`);
        await queryRunner.query(`COMMENT ON COLUMN "orders"."is_scheduled" IS 'Flag to indicate if the order is scheduled for future delivery'`);
        await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "is_scheduled"`);
        await queryRunner.query(`ALTER TABLE "menu_items" ADD "document_tsvector" tsvector`);
        await queryRunner.query(`ALTER TABLE "restaurants" ADD "document_tsvector" tsvector`);
        await queryRunner.query(`DROP INDEX "public"."idx_scheduled_jobs_run_at"`);
        await queryRunner.query(`DROP TABLE "scheduled_jobs"`);
        await queryRunner.query(`DROP TYPE "public"."scheduled_jobs_status_enum"`);
        await queryRunner.query(`CREATE UNIQUE INDEX "idx_customer_menu_unique" ON "customer_menu_ranking" ("customer_id", "menu_item_id") `);
        await queryRunner.query(`CREATE INDEX "restaurants_document_tsvector_idx" ON "restaurants" ("document_tsvector") `);
        await queryRunner.query(`ALTER TABLE "customer_menu_ranking" ADD CONSTRAINT "fk_customer_menu_ranking_menu_item" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
    }

}
