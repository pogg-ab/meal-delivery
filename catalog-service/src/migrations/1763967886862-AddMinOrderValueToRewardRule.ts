import { MigrationInterface, QueryRunner } from "typeorm";

export class AddMinOrderValueToRewardRule1763967886862 implements MigrationInterface {
    name = 'AddMinOrderValueToRewardRule1763967886862'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "reward_rules" ADD "min_order_value" numeric(10,2) NOT NULL DEFAULT '0'`);
        await queryRunner.query(`COMMENT ON COLUMN "reward_rules"."min_order_value" IS 'The minimum order total required for this rule to apply.'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`COMMENT ON COLUMN "reward_rules"."min_order_value" IS 'The minimum order total required for this rule to apply.'`);
        await queryRunner.query(`ALTER TABLE "reward_rules" DROP COLUMN "min_order_value"`);
    }

}
