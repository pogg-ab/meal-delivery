import { MigrationInterface, QueryRunner } from "typeorm";

export class AddRedeemPercentageToRewardRule1763973541287 implements MigrationInterface {
    name = 'AddRedeemPercentageToRewardRule1763973541287'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "reward_rules" ADD "max_redeem_percentage" integer NOT NULL DEFAULT '100'`);
        await queryRunner.query(`COMMENT ON COLUMN "reward_rules"."max_redeem_percentage" IS 'The maximum percentage of an order total that can be paid for with points using this rule.'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`COMMENT ON COLUMN "reward_rules"."max_redeem_percentage" IS 'The maximum percentage of an order total that can be paid for with points using this rule.'`);
        await queryRunner.query(`ALTER TABLE "reward_rules" DROP COLUMN "max_redeem_percentage"`);
    }

}
