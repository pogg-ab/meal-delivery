import { MigrationInterface, QueryRunner } from "typeorm";

export class AddLocationToRestaurant1762334455441 implements MigrationInterface {
    name = 'AddLocationToRestaurant1762334455441'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "restaurants" ADD "description" text`);
        await queryRunner.query(`ALTER TABLE "restaurants" ADD "street" character varying`);
        await queryRunner.query(`ALTER TABLE "restaurants" ADD "city" character varying`);
        await queryRunner.query(`ALTER TABLE "restaurants" ADD "region" character varying`);
        await queryRunner.query(`ALTER TABLE "restaurants" ADD "country" character varying`);
        await queryRunner.query(`ALTER TABLE "restaurants" ADD "latitude" numeric(9,6)`);
        await queryRunner.query(`ALTER TABLE "restaurants" ADD "longitude" numeric(9,6)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "restaurants" DROP COLUMN "longitude"`);
        await queryRunner.query(`ALTER TABLE "restaurants" DROP COLUMN "latitude"`);
        await queryRunner.query(`ALTER TABLE "restaurants" DROP COLUMN "country"`);
        await queryRunner.query(`ALTER TABLE "restaurants" DROP COLUMN "region"`);
        await queryRunner.query(`ALTER TABLE "restaurants" DROP COLUMN "city"`);
        await queryRunner.query(`ALTER TABLE "restaurants" DROP COLUMN "street"`);
        await queryRunner.query(`ALTER TABLE "restaurants" DROP COLUMN "description"`);
    }

}
