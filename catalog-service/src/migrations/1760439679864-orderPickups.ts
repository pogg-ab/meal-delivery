import { MigrationInterface, QueryRunner } from "typeorm";

export class OrderPickups1760439679864 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
// Ensure uuid extension exists (Postgres)
await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

await queryRunner.query(`
CREATE TABLE "order_pickups" (
"id" uuid NOT NULL DEFAULT uuid_generate_v4(),
"order_id" uuid NOT NULL,
"pickup_code_hash" character varying(128) NOT NULL,
"pickup_token" character varying(1024),
"expires_at" TIMESTAMP,
"verified" boolean NOT NULL DEFAULT false,
"verified_by" uuid,
"verified_at" TIMESTAMP,
"attempts_count" integer NOT NULL DEFAULT 0,
"max_attempts" integer NOT NULL DEFAULT 5,
"last_attempt_at" TIMESTAMP,
"created_at" TIMESTAMP NOT NULL DEFAULT now(),
"updated_at" TIMESTAMP NOT NULL DEFAULT now(),
CONSTRAINT "PK_order_pickups_id" PRIMARY KEY ("id")
)
`);


// unique index on order_id
await queryRunner.query(`CREATE UNIQUE INDEX "IDX_order_pickups_order_id_unique" ON "order_pickups" ("order_id")`);


// foreign key to orders table (assumes table "orders" with primary key "id")
await queryRunner.query(`
ALTER TABLE "order_pickups"
ADD CONSTRAINT "FK_order_pickups_order_id_orders_id"
FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE
`);
}

public async down(queryRunner: QueryRunner): Promise<void> {
await queryRunner.query(`ALTER TABLE "order_pickups" DROP CONSTRAINT "FK_order_pickups_order_id_orders_id"`);
await queryRunner.query(`DROP INDEX "IDX_order_pickups_order_id_unique"`);
await queryRunner.query(`DROP TABLE "order_pickups"`);
// leaving extension as-is (safe to keep)
 }
}
