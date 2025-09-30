import { MigrationInterface, QueryRunner } from "typeorm";

export class AddRestaurantAndReorderLevelToInventory1759210901610 implements MigrationInterface {
    name = 'AddRestaurantAndReorderLevelToInventory1759210901610'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "order_items" DROP CONSTRAINT "FK_order_items_order"`);
        await queryRunner.query(`ALTER TABLE "order_items" DROP CONSTRAINT "FK_order_items_menu_item"`);
        await queryRunner.query(`ALTER TABLE "order_events" DROP CONSTRAINT "FK_order_events_order"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_order_items_order"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_order_events_order"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_orders_customer"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_orders_restaurant"`);
        await queryRunner.query(`ALTER TABLE "order_items" DROP COLUMN "created_at"`);
        await queryRunner.query(`ALTER TABLE "order_items" DROP COLUMN "updated_at"`);
        await queryRunner.query(`ALTER TABLE "inventory" ADD "restaurant_id" uuid NOT NULL`);
        await queryRunner.query(`ALTER TABLE "inventory" ADD "reorder_level" integer NOT NULL DEFAULT '5'`);
        await queryRunner.query(`ALTER TABLE "order_items" ALTER COLUMN "unit_price" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "order_items" ALTER COLUMN "subtotal" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "order_events" ALTER COLUMN "order_id" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "order_events" DROP COLUMN "action"`);
        await queryRunner.query(`ALTER TABLE "order_events" ADD "action" character varying(50) NOT NULL`);
        await queryRunner.query(`ALTER TABLE "order_events" DROP COLUMN "created_at"`);
        await queryRunner.query(`ALTER TABLE "order_events" ADD "created_at" TIMESTAMP NOT NULL DEFAULT now()`);
        await queryRunner.query(`ALTER TYPE "public"."order_status_enum" RENAME TO "order_status_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."orders_status_enum" AS ENUM('PENDING', 'DECLINED', 'ACCEPTED', 'AWAITING_PAYMENT', 'PAID', 'PREPARING', 'READY', 'CUSTOMER_COMING', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'COMPLETED')`);
        await queryRunner.query(`ALTER TABLE "orders" ALTER COLUMN "status" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "orders" ALTER COLUMN "status" TYPE "public"."orders_status_enum" USING "status"::"text"::"public"."orders_status_enum"`);
        await queryRunner.query(`ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'PENDING'`);
        await queryRunner.query(`DROP TYPE "public"."order_status_enum_old"`);
        await queryRunner.query(`ALTER TYPE "public"."payment_status_enum" RENAME TO "payment_status_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."orders_payment_status_enum" AS ENUM('NONE', 'PENDING', 'PAID', 'FAILED', 'REFUNDED')`);
        await queryRunner.query(`ALTER TABLE "orders" ALTER COLUMN "payment_status" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "orders" ALTER COLUMN "payment_status" TYPE "public"."orders_payment_status_enum" USING "payment_status"::"text"::"public"."orders_payment_status_enum"`);
        await queryRunner.query(`ALTER TABLE "orders" ALTER COLUMN "payment_status" SET DEFAULT 'NONE'`);
        await queryRunner.query(`DROP TYPE "public"."payment_status_enum_old"`);
        await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "paid_at"`);
        await queryRunner.query(`ALTER TABLE "orders" ADD "paid_at" TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "created_at"`);
        await queryRunner.query(`ALTER TABLE "orders" ADD "created_at" TIMESTAMP NOT NULL DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "updated_at"`);
        await queryRunner.query(`ALTER TABLE "orders" ADD "updated_at" TIMESTAMP NOT NULL DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "inventory" ADD CONSTRAINT "FK_efb30f8989085ae38d3446dbd82" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "order_items" ADD CONSTRAINT "FK_145532db85752b29c57d2b7b1f1" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "order_items" ADD CONSTRAINT "FK_e462517174f561ece2916701c0a" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "order_events" ADD CONSTRAINT "FK_b33cbf9a59cbee112d94bcb59de" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "orders" ADD CONSTRAINT "FK_85fdda5fcce2f397ef8f117a2c6" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "orders" DROP CONSTRAINT "FK_85fdda5fcce2f397ef8f117a2c6"`);
        await queryRunner.query(`ALTER TABLE "order_events" DROP CONSTRAINT "FK_b33cbf9a59cbee112d94bcb59de"`);
        await queryRunner.query(`ALTER TABLE "order_items" DROP CONSTRAINT "FK_e462517174f561ece2916701c0a"`);
        await queryRunner.query(`ALTER TABLE "order_items" DROP CONSTRAINT "FK_145532db85752b29c57d2b7b1f1"`);
        await queryRunner.query(`ALTER TABLE "inventory" DROP CONSTRAINT "FK_efb30f8989085ae38d3446dbd82"`);
        await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "updated_at"`);
        await queryRunner.query(`ALTER TABLE "orders" ADD "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "created_at"`);
        await queryRunner.query(`ALTER TABLE "orders" ADD "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "paid_at"`);
        await queryRunner.query(`ALTER TABLE "orders" ADD "paid_at" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`CREATE TYPE "public"."payment_status_enum_old" AS ENUM('NONE', 'PAID', 'FAILED')`);
        await queryRunner.query(`ALTER TABLE "orders" ALTER COLUMN "payment_status" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "orders" ALTER COLUMN "payment_status" TYPE "public"."payment_status_enum_old" USING "payment_status"::"text"::"public"."payment_status_enum_old"`);
        await queryRunner.query(`ALTER TABLE "orders" ALTER COLUMN "payment_status" SET DEFAULT 'NONE'`);
        await queryRunner.query(`DROP TYPE "public"."orders_payment_status_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."payment_status_enum_old" RENAME TO "payment_status_enum"`);
        await queryRunner.query(`CREATE TYPE "public"."order_status_enum_old" AS ENUM('PENDING', 'ACCEPTED', 'DECLINED', 'PREPARING', 'READY', 'AWAITING_PAYMENT', 'PAID', 'CUSTOMER_COMING', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED')`);
        await queryRunner.query(`ALTER TABLE "orders" ALTER COLUMN "status" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "orders" ALTER COLUMN "status" TYPE "public"."order_status_enum_old" USING "status"::"text"::"public"."order_status_enum_old"`);
        await queryRunner.query(`ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'PENDING'`);
        await queryRunner.query(`DROP TYPE "public"."orders_status_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."order_status_enum_old" RENAME TO "order_status_enum"`);
        await queryRunner.query(`ALTER TABLE "order_events" DROP COLUMN "created_at"`);
        await queryRunner.query(`ALTER TABLE "order_events" ADD "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "order_events" DROP COLUMN "action"`);
        await queryRunner.query(`ALTER TABLE "order_events" ADD "action" character varying(100) NOT NULL`);
        await queryRunner.query(`ALTER TABLE "order_events" ALTER COLUMN "order_id" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "order_items" ALTER COLUMN "subtotal" SET DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "order_items" ALTER COLUMN "unit_price" SET DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "inventory" DROP COLUMN "reorder_level"`);
        await queryRunner.query(`ALTER TABLE "inventory" DROP COLUMN "restaurant_id"`);
        await queryRunner.query(`ALTER TABLE "order_items" ADD "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "order_items" ADD "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()`);
        await queryRunner.query(`CREATE INDEX "IDX_orders_restaurant" ON "orders" ("restaurant_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_orders_customer" ON "orders" ("customer_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_order_events_order" ON "order_events" ("order_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_order_items_order" ON "order_items" ("order_id") `);
        await queryRunner.query(`ALTER TABLE "order_events" ADD CONSTRAINT "FK_order_events_order" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "order_items" ADD CONSTRAINT "FK_order_items_menu_item" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "order_items" ADD CONSTRAINT "FK_order_items_order" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

}
