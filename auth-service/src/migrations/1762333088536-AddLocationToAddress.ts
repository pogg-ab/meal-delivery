import { MigrationInterface, QueryRunner } from "typeorm";

export class AddLocationToAddress1762333088536 implements MigrationInterface {
    name = 'AddLocationToAddress1762333088536'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "addresses" ADD "latitude" numeric(9,6)`);
        await queryRunner.query(`ALTER TABLE "addresses" ADD "longitude" numeric(9,6)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "addresses" DROP COLUMN "longitude"`);
        await queryRunner.query(`ALTER TABLE "addresses" DROP COLUMN "latitude"`);
    }

}
