import { MigrationInterface, QueryRunner } from "typeorm";

export class AddRatingAttribute1759599814765 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
    // Add columns separately (safer and clearer)
    await queryRunner.query(`
      ALTER TABLE "restaurants"
      ADD COLUMN IF NOT EXISTS "average_rating" numeric(3,2) NOT NULL DEFAULT 0;
    `);

    await queryRunner.query(`
      ALTER TABLE "restaurants"
      ADD COLUMN IF NOT EXISTS "ratings_count" integer NOT NULL DEFAULT 0;
    `);

    // Add constraint only if it does not already exist (Postgres has no IF NOT EXISTS for ADD CONSTRAINT)
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'CHK_restaurants_average_rating_range'
        ) THEN
          ALTER TABLE "restaurants"
          ADD CONSTRAINT "CHK_restaurants_average_rating_range"
          CHECK (average_rating >= 0 AND average_rating <= 5);
        END IF;
      END
      $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop constraint then columns
    await queryRunner.query(`
      ALTER TABLE "restaurants"
      DROP CONSTRAINT IF EXISTS "CHK_restaurants_average_rating_range";
    `);

    await queryRunner.query(`
      ALTER TABLE "restaurants"
      DROP COLUMN IF EXISTS "average_rating";
    `);

    await queryRunner.query(`
      ALTER TABLE "restaurants"
      DROP COLUMN IF EXISTS "ratings_count";
    `);
  }
}
