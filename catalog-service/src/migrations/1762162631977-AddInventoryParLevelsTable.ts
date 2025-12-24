import { MigrationInterface, QueryRunner } from "typeorm";

export class AddInventoryParLevelsTable1762162631977 implements MigrationInterface {
    name = 'AddInventoryParLevelsTable1762162631977'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "order_pickups" DROP CONSTRAINT "FK_order_pickups_order_id_orders_id"`);
        await queryRunner.query(`DROP INDEX "public"."menu_item_document_tsvector_idx"`);
        await queryRunner.query(`DROP INDEX "public"."restaurant_document_tsvector_idx"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_PROMO_CODES_code_unique"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_order_pickups_order_id_unique"`);
        await queryRunner.query(`ALTER TABLE "promo_codes" DROP CONSTRAINT "promo_codes_discount_type_check"`);
        await queryRunner.query(`ALTER TABLE "promo_codes" DROP CONSTRAINT "promo_codes_issuer_type_check"`);
        await queryRunner.query(`ALTER TABLE "promo_codes" DROP CONSTRAINT "promo_codes_restaurant_share_percent_check"`);
        await queryRunner.query(`CREATE TABLE "inventory_par_levels" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "menu_item_id" uuid NOT NULL, "restaurant_id" uuid NOT NULL, "par_level" integer NOT NULL, CONSTRAINT "UQ_6ae8682fcc6013332f3bef9bc00" UNIQUE ("menu_item_id"), CONSTRAINT "PK_53b5927e5726c05cf70caf9bac2" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "menu_items" DROP COLUMN "document_tsvector"`);
        await queryRunner.query(`ALTER TABLE "restaurants" DROP COLUMN "address"`);
        await queryRunner.query(`ALTER TABLE "restaurants" DROP COLUMN "rating"`);
        await queryRunner.query(`ALTER TABLE "restaurants" DROP COLUMN "document_tsvector"`);
        await queryRunner.query(`ALTER TYPE "public"."orders_payment_status_enum" RENAME TO "orders_payment_status_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."orders_payment_status_enum" AS ENUM('NONE', 'PENDING', 'INITIATED', 'PAID', 'FAILED', 'REFUNDED', 'EXPIRED')`);
        await queryRunner.query(`ALTER TABLE "orders" ALTER COLUMN "payment_status" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "orders" ALTER COLUMN "payment_status" TYPE "public"."orders_payment_status_enum" USING "payment_status"::"text"::"public"."orders_payment_status_enum"`);
        await queryRunner.query(`ALTER TABLE "orders" ALTER COLUMN "payment_status" SET DEFAULT 'NONE'`);
        await queryRunner.query(`DROP TYPE "public"."orders_payment_status_enum_old"`);
        await queryRunner.query(`ALTER TABLE "promo_codes" ALTER COLUMN "id" SET DEFAULT uuid_generate_v4()`);
        await queryRunner.query(`ALTER TABLE "promo_codes" ALTER COLUMN "created_at" SET DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "promo_codes" ALTER COLUMN "updated_at" SET DEFAULT now()`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_2f096c406a9d9d5b8ce204190c" ON "promo_codes" ("code") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_cab7a0b4338c4a1caca2482c29" ON "order_pickups" ("order_id") `);
        await queryRunner.query(`ALTER TABLE "order_pickups" ADD CONSTRAINT "FK_cab7a0b4338c4a1caca2482c29f" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "inventory_par_levels" ADD CONSTRAINT "FK_6ae8682fcc6013332f3bef9bc00" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "inventory_par_levels" ADD CONSTRAINT "FK_6b77cb4d0f5d29c34465c06fb9a" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "inventory_par_levels" DROP CONSTRAINT "FK_6b77cb4d0f5d29c34465c06fb9a"`);
        await queryRunner.query(`ALTER TABLE "inventory_par_levels" DROP CONSTRAINT "FK_6ae8682fcc6013332f3bef9bc00"`);
        await queryRunner.query(`ALTER TABLE "order_pickups" DROP CONSTRAINT "FK_cab7a0b4338c4a1caca2482c29f"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_cab7a0b4338c4a1caca2482c29"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_2f096c406a9d9d5b8ce204190c"`);
        await queryRunner.query(`ALTER TABLE "promo_codes" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "promo_codes" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "promo_codes" ALTER COLUMN "id" DROP DEFAULT`);
        await queryRunner.query(`CREATE TYPE "public"."orders_payment_status_enum_old" AS ENUM('NONE', 'PENDING', 'INITIATED', 'EXPIRED', 'PAID', 'FAILED')`);
        await queryRunner.query(`ALTER TABLE "orders" ALTER COLUMN "payment_status" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "orders" ALTER COLUMN "payment_status" TYPE "public"."orders_payment_status_enum_old" USING "payment_status"::"text"::"public"."orders_payment_status_enum_old"`);
        await queryRunner.query(`ALTER TABLE "orders" ALTER COLUMN "payment_status" SET DEFAULT 'NONE'`);
        await queryRunner.query(`DROP TYPE "public"."orders_payment_status_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."orders_payment_status_enum_old" RENAME TO "orders_payment_status_enum"`);
        await queryRunner.query(`ALTER TABLE "restaurants" ADD "document_tsvector" tsvector`);
        await queryRunner.query(`ALTER TABLE "restaurants" ADD "rating" numeric(2,1) DEFAULT 0.0`);
        await queryRunner.query(`ALTER TABLE "restaurants" ADD "address" text`);
        await queryRunner.query(`ALTER TABLE "menu_items" ADD "document_tsvector" tsvector`);
        await queryRunner.query(`DROP TABLE "inventory_par_levels"`);
        await queryRunner.query(`ALTER TABLE "promo_codes" ADD CONSTRAINT "promo_codes_restaurant_share_percent_check" CHECK (((restaurant_share_percent >= 0) AND (restaurant_share_percent <= 100)))`);
        await queryRunner.query(`ALTER TABLE "promo_codes" ADD CONSTRAINT "promo_codes_issuer_type_check" CHECK (((issuer_type)::text = ANY ((ARRAY['restaurant'::character varying, 'platform'::character varying, 'shared'::character varying])::text[])))`);
        await queryRunner.query(`ALTER TABLE "promo_codes" ADD CONSTRAINT "promo_codes_discount_type_check" CHECK (((discount_type)::text = ANY ((ARRAY['percentage'::character varying, 'fixed'::character varying])::text[])))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_order_pickups_order_id_unique" ON "order_pickups" ("order_id") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_PROMO_CODES_code_unique" ON "promo_codes" ("code") `);
        await queryRunner.query(`CREATE INDEX "restaurant_document_tsvector_idx" ON "restaurants" ("document_tsvector") `);
        await queryRunner.query(`CREATE INDEX "menu_item_document_tsvector_idx" ON "menu_items" ("document_tsvector") `);
        await queryRunner.query(`ALTER TABLE "order_pickups" ADD CONSTRAINT "FK_order_pickups_order_id_orders_id" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

}
