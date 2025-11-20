import { MigrationInterface, QueryRunner } from "typeorm";

export class AddRewardsSystem1763541273304 implements MigrationInterface {
    name = 'AddRewardsSystem1763541273304'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."reward_points_ledger_type_enum" AS ENUM('EARNED', 'REDEEMED', 'ADJUSTED', 'EXPIRED')`);
        await queryRunner.query(`CREATE TABLE "reward_points_ledger" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "customer_id" uuid NOT NULL, "order_id" uuid, "points" integer NOT NULL, "type" "public"."reward_points_ledger_type_enum" NOT NULL, "description" character varying(255), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_d17eeaa404e1db58a010d49d2b4" PRIMARY KEY ("id")); COMMENT ON COLUMN "reward_points_ledger"."points" IS 'Positive for earning, negative for spending.'`);
        await queryRunner.query(`CREATE INDEX "idx_reward_ledger_customer_id" ON "reward_points_ledger" ("customer_id") `);
        await queryRunner.query(`CREATE INDEX "idx_reward_ledger_order_id" ON "reward_points_ledger" ("order_id") `);
        await queryRunner.query(`CREATE TABLE "reward_points_balance" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "customer_id" uuid NOT NULL, "total_points" integer NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_fd35123f1534f98110d7b6bb409" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_reward_balance_customer_id" ON "reward_points_balance" ("customer_id") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."idx_reward_balance_customer_id"`);
        await queryRunner.query(`DROP TABLE "reward_points_balance"`);
        await queryRunner.query(`DROP INDEX "public"."idx_reward_ledger_order_id"`);
        await queryRunner.query(`DROP INDEX "public"."idx_reward_ledger_customer_id"`);
        await queryRunner.query(`DROP TABLE "reward_points_ledger"`);
        await queryRunner.query(`DROP TYPE "public"."reward_points_ledger_type_enum"`);
    }

}
