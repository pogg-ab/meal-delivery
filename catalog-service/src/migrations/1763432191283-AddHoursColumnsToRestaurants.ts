import { MigrationInterface, QueryRunner } from "typeorm";

export class AddHoursColumnsToRestaurants1763432191283 implements MigrationInterface {
    name = 'AddHoursColumnsToRestaurants1763432191283'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "restaurants" ADD "sunday_open" TIME`);
        await queryRunner.query(`COMMENT ON COLUMN "restaurants"."sunday_open" IS 'Sunday opening time'`);
        await queryRunner.query(`ALTER TABLE "restaurants" ADD "sunday_close" TIME`);
        await queryRunner.query(`COMMENT ON COLUMN "restaurants"."sunday_close" IS 'Sunday closing time'`);
        await queryRunner.query(`ALTER TABLE "restaurants" ADD "monday_open" TIME`);
        await queryRunner.query(`COMMENT ON COLUMN "restaurants"."monday_open" IS 'Monday opening time'`);
        await queryRunner.query(`ALTER TABLE "restaurants" ADD "monday_close" TIME`);
        await queryRunner.query(`COMMENT ON COLUMN "restaurants"."monday_close" IS 'Monday closing time'`);
        await queryRunner.query(`ALTER TABLE "restaurants" ADD "tuesday_open" TIME`);
        await queryRunner.query(`COMMENT ON COLUMN "restaurants"."tuesday_open" IS 'Tuesday opening time'`);
        await queryRunner.query(`ALTER TABLE "restaurants" ADD "tuesday_close" TIME`);
        await queryRunner.query(`COMMENT ON COLUMN "restaurants"."tuesday_close" IS 'Tuesday closing time'`);
        await queryRunner.query(`ALTER TABLE "restaurants" ADD "wednesday_open" TIME`);
        await queryRunner.query(`COMMENT ON COLUMN "restaurants"."wednesday_open" IS 'Wednesday opening time'`);
        await queryRunner.query(`ALTER TABLE "restaurants" ADD "wednesday_close" TIME`);
        await queryRunner.query(`COMMENT ON COLUMN "restaurants"."wednesday_close" IS 'Wednesday closing time'`);
        await queryRunner.query(`ALTER TABLE "restaurants" ADD "thursday_open" TIME`);
        await queryRunner.query(`COMMENT ON COLUMN "restaurants"."thursday_open" IS 'Thursday opening time'`);
        await queryRunner.query(`ALTER TABLE "restaurants" ADD "thursday_close" TIME`);
        await queryRunner.query(`COMMENT ON COLUMN "restaurants"."thursday_close" IS 'Thursday closing time'`);
        await queryRunner.query(`ALTER TABLE "restaurants" ADD "friday_open" TIME`);
        await queryRunner.query(`COMMENT ON COLUMN "restaurants"."friday_open" IS 'Friday opening time'`);
        await queryRunner.query(`ALTER TABLE "restaurants" ADD "friday_close" TIME`);
        await queryRunner.query(`COMMENT ON COLUMN "restaurants"."friday_close" IS 'Friday closing time'`);
        await queryRunner.query(`ALTER TABLE "restaurants" ADD "saturday_open" TIME`);
        await queryRunner.query(`COMMENT ON COLUMN "restaurants"."saturday_open" IS 'Saturday opening time'`);
        await queryRunner.query(`ALTER TABLE "restaurants" ADD "saturday_close" TIME`);
        await queryRunner.query(`COMMENT ON COLUMN "restaurants"."saturday_close" IS 'Saturday closing time'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`COMMENT ON COLUMN "restaurants"."saturday_close" IS 'Saturday closing time'`);
        await queryRunner.query(`ALTER TABLE "restaurants" DROP COLUMN "saturday_close"`);
        await queryRunner.query(`COMMENT ON COLUMN "restaurants"."saturday_open" IS 'Saturday opening time'`);
        await queryRunner.query(`ALTER TABLE "restaurants" DROP COLUMN "saturday_open"`);
        await queryRunner.query(`COMMENT ON COLUMN "restaurants"."friday_close" IS 'Friday closing time'`);
        await queryRunner.query(`ALTER TABLE "restaurants" DROP COLUMN "friday_close"`);
        await queryRunner.query(`COMMENT ON COLUMN "restaurants"."friday_open" IS 'Friday opening time'`);
        await queryRunner.query(`ALTER TABLE "restaurants" DROP COLUMN "friday_open"`);
        await queryRunner.query(`COMMENT ON COLUMN "restaurants"."thursday_close" IS 'Thursday closing time'`);
        await queryRunner.query(`ALTER TABLE "restaurants" DROP COLUMN "thursday_close"`);
        await queryRunner.query(`COMMENT ON COLUMN "restaurants"."thursday_open" IS 'Thursday opening time'`);
        await queryRunner.query(`ALTER TABLE "restaurants" DROP COLUMN "thursday_open"`);
        await queryRunner.query(`COMMENT ON COLUMN "restaurants"."wednesday_close" IS 'Wednesday closing time'`);
        await queryRunner.query(`ALTER TABLE "restaurants" DROP COLUMN "wednesday_close"`);
        await queryRunner.query(`COMMENT ON COLUMN "restaurants"."wednesday_open" IS 'Wednesday opening time'`);
        await queryRunner.query(`ALTER TABLE "restaurants" DROP COLUMN "wednesday_open"`);
        await queryRunner.query(`COMMENT ON COLUMN "restaurants"."tuesday_close" IS 'Tuesday closing time'`);
        await queryRunner.query(`ALTER TABLE "restaurants" DROP COLUMN "tuesday_close"`);
        await queryRunner.query(`COMMENT ON COLUMN "restaurants"."tuesday_open" IS 'Tuesday opening time'`);
        await queryRunner.query(`ALTER TABLE "restaurants" DROP COLUMN "tuesday_open"`);
        await queryRunner.query(`COMMENT ON COLUMN "restaurants"."monday_close" IS 'Monday closing time'`);
        await queryRunner.query(`ALTER TABLE "restaurants" DROP COLUMN "monday_close"`);
        await queryRunner.query(`COMMENT ON COLUMN "restaurants"."monday_open" IS 'Monday opening time'`);
        await queryRunner.query(`ALTER TABLE "restaurants" DROP COLUMN "monday_open"`);
        await queryRunner.query(`COMMENT ON COLUMN "restaurants"."sunday_close" IS 'Sunday closing time'`);
        await queryRunner.query(`ALTER TABLE "restaurants" DROP COLUMN "sunday_close"`);
        await queryRunner.query(`COMMENT ON COLUMN "restaurants"."sunday_open" IS 'Sunday opening time'`);
        await queryRunner.query(`ALTER TABLE "restaurants" DROP COLUMN "sunday_open"`);
    }

}
