import { MigrationInterface, QueryRunner } from "typeorm";

export class UpdateOrderTable1761637629013 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
    // gross_amount numeric(12,2) nullable
    await queryRunner.query(`
      ALTER TABLE "orders"
      ADD COLUMN IF NOT EXISTS "gross_amount" numeric(12,2) NULL
    `);

    // discount_amount numeric(12,2) nullable
    await queryRunner.query(`
      ALTER TABLE "orders"
      ADD COLUMN IF NOT EXISTS "discount_amount" numeric(12,2) NULL
    `);

    // discount_breakdown jsonb nullable
    await queryRunner.query(`
      ALTER TABLE "orders"
      ADD COLUMN IF NOT EXISTS "discount_breakdown" jsonb NULL
    `);

    // promo_code varchar(64) nullable
    await queryRunner.query(`
      ALTER TABLE "orders"
      ADD COLUMN IF NOT EXISTS "promo_code" character varying(64) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // drop in reverse order
    await queryRunner.query(`
      ALTER TABLE "orders"
      DROP COLUMN IF EXISTS "promo_code"
    `);

    await queryRunner.query(`
      ALTER TABLE "orders"
      DROP COLUMN IF EXISTS "discount_breakdown"
    `);

    await queryRunner.query(`
      ALTER TABLE "orders"
      DROP COLUMN IF EXISTS "discount_amount"
    `);

    await queryRunner.query(`
      ALTER TABLE "orders"
      DROP COLUMN IF EXISTS "gross_amount"
    `);
  }
}
