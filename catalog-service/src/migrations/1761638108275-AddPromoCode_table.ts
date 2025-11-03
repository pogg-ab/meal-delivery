import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPromoCodeTable1761638108275 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "promo_codes" (
        "id" uuid PRIMARY KEY,
        "code" character varying(64) NOT NULL,
        "discount_type" character varying(20) NOT NULL CHECK (discount_type IN ('percentage','fixed')),
        "discount_value" numeric(12,2) NOT NULL,
        "issuer_type" character varying(20) NOT NULL CHECK (issuer_type IN ('restaurant','platform','shared')),
        "applicable_restaurant_id" uuid NULL,
        "restaurant_share_percent" integer NULL DEFAULT 50 CHECK (restaurant_share_percent >= 0 AND restaurant_share_percent <= 100),
        "max_uses" integer NULL,
        "uses_count" integer NOT NULL DEFAULT 0,
        "expiry_date" timestamp NULL,
        "active" boolean NOT NULL DEFAULT true,
        "meta" jsonb NULL,
        "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    //-- unique index for code
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_PROMO_CODES_code_unique" ON "promo_codes" ("code")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS "promo_codes"
    `);
  }

}
