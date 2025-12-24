import { MigrationInterface, QueryRunner } from "typeorm";

export class MigrateOrderRelatedTables1759044182403 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
    // Create enums
    await queryRunner.query(`
      CREATE TYPE "order_status_enum" AS ENUM(
        'PENDING',
        'ACCEPTED',
        'DECLINED',
        'PREPARING',
        'READY',
        'AWAITING_PAYMENT',
        'PAID',
        'CUSTOMER_COMING',
        'OUT_FOR_DELIVERY',
        'DELIVERED',
        'CANCELLED'
      );
    `);

    await queryRunner.query(`
      CREATE TYPE "payment_status_enum" AS ENUM(
        'NONE',
        'PAID',
        'FAILED'
      );
    `);

    // orders table
    await queryRunner.query(`
      CREATE TABLE "orders" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "customer_id" uuid NOT NULL,
        "restaurant_id" uuid NOT NULL,
        "status" "order_status_enum" NOT NULL DEFAULT 'PENDING',
        "payment_status" "payment_status_enum" NOT NULL DEFAULT 'NONE',
        "total_amount" numeric(10,2) NOT NULL DEFAULT 0,
        "currency" varchar(10) NOT NULL DEFAULT 'USD',
        "instructions" text,
        "is_delivery" boolean NOT NULL DEFAULT false,
        "payment_reference" varchar(255),
        "paid_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_orders_id" PRIMARY KEY ("id")
      );
    `);

    // order_items table
    await queryRunner.query(`
      CREATE TABLE "order_items" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "order_id" uuid NOT NULL,
        "menu_item_id" uuid,
        "name" varchar(255) NOT NULL,
        "unit_price" numeric(10,2) NOT NULL DEFAULT 0,
        "quantity" integer NOT NULL DEFAULT 1,
        "subtotal" numeric(10,2) NOT NULL DEFAULT 0,
        "instructions" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_order_items_id" PRIMARY KEY ("id")
      );
    `);

    // order_events table (order_id nullable so we can log non-order scoped events)
    await queryRunner.query(`
      CREATE TABLE "order_events" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "order_id" uuid,
        "actor_id" uuid,
        "action" varchar(100) NOT NULL,
        "meta" jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_order_events_id" PRIMARY KEY ("id")
      );
    `);

    // Foreign keys
    await queryRunner.query(`
      ALTER TABLE "order_items"
      ADD CONSTRAINT "FK_order_items_order" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE;
    `);

    // Keep menu_item FK optional (history); set to SET NULL on delete of menu item
    await queryRunner.query(`
      ALTER TABLE "order_items"
      ADD CONSTRAINT "FK_order_items_menu_item" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE SET NULL;
    `);

    // Link order_events to orders when present
    await queryRunner.query(`
      ALTER TABLE "order_events"
      ADD CONSTRAINT "FK_order_events_order" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE;
    `);

    // Indexes for fast queries
    await queryRunner.query(`CREATE INDEX "IDX_orders_customer" ON "orders" ("customer_id");`);
    await queryRunner.query(`CREATE INDEX "IDX_orders_restaurant" ON "orders" ("restaurant_id");`);
    await queryRunner.query(`CREATE INDEX "IDX_order_items_order" ON "order_items" ("order_id");`);
    await queryRunner.query(`CREATE INDEX "IDX_order_events_order" ON "order_events" ("order_id");`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes / FKs then tables then types (reverse order)
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_order_events_order";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_order_items_order";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_orders_restaurant";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_orders_customer";`);

    await queryRunner.query(`ALTER TABLE "order_events" DROP CONSTRAINT IF EXISTS "FK_order_events_order";`);
    await queryRunner.query(`ALTER TABLE "order_items" DROP CONSTRAINT IF EXISTS "FK_order_items_menu_item";`);
    await queryRunner.query(`ALTER TABLE "order_items" DROP CONSTRAINT IF EXISTS "FK_order_items_order";`);

    await queryRunner.query(`DROP TABLE IF EXISTS "order_events";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "order_items";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "orders";`);

    await queryRunner.query(`DROP TYPE IF EXISTS "payment_status_enum";`);
    await queryRunner.query(`DROP TYPE IF EXISTS "order_status_enum";`);
  }
}
