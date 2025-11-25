import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitSchemats1759573153722 implements MigrationInterface {
  name = 'InitSchema.ts1759573153722';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE "restaurant_subaccounts" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "restaurant_id" uuid NOT NULL,
                "chapa_subaccount_id" character varying(255) NOT NULL,
                "raw" jsonb,
                "onboarded_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_940c05ab55003c207960ec77a12" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_1cc0c6bf23d2db7a5964bcf588" ON "restaurant_subaccounts" ("restaurant_id")
        `);
    await queryRunner.query(`
            CREATE TABLE "payments" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "order_id" uuid NOT NULL,
                "tx_ref" character varying(255) NOT NULL,
                "chapa_tx_id" character varying(255),
                "amount" numeric(12, 2) NOT NULL,
                "currency" character varying(10) NOT NULL DEFAULT 'ETB',
                "status" character varying(20) NOT NULL,
                "payment_data" jsonb,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_197ab7af18c93fbb0c9b28b4a59" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_b2f7b823a21562eeca20e72b00" ON "payments" ("order_id")
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_a8a7d8c89a4ef936b9ad7028d2" ON "payments" ("tx_ref")
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DROP INDEX "public"."IDX_a8a7d8c89a4ef936b9ad7028d2"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_b2f7b823a21562eeca20e72b00"
        `);
    await queryRunner.query(`
            DROP TABLE "payments"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_1cc0c6bf23d2db7a5964bcf588"
        `);
    await queryRunner.query(`
            DROP TABLE "restaurant_subaccounts"
        `);
  }
}
