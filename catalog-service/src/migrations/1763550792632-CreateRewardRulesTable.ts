import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateRewardRulesTable1763550792632 implements MigrationInterface {
    name = 'CreateRewardRulesTable1763550792632'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."reward_rules_type_enum" AS ENUM('EARNING', 'REDEMPTION')`);
        await queryRunner.query(`CREATE TABLE "reward_rules" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "rule_name" character varying(255) NOT NULL, "type" "public"."reward_rules_type_enum" NOT NULL, "conversion_rate" numeric(10,4) NOT NULL, "is_active" boolean NOT NULL DEFAULT false, "start_date" TIMESTAMP WITH TIME ZONE, "end_date" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_cb41e1a2dc879aaaf54c01a7973" UNIQUE ("rule_name"), CONSTRAINT "PK_7e75373e3325158b8745f3dde45" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "reward_rules"`);
        await queryRunner.query(`DROP TYPE "public"."reward_rules_type_enum"`);
    }

}
