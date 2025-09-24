import { MigrationInterface, QueryRunner } from "typeorm";

export class AddRejectionReasonToRestaurant1758617660231 implements MigrationInterface {
    name = 'AddRejectionReasonToRestaurant1758617660231'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "restaurants" ADD "rejection_reason" text`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "restaurants" DROP COLUMN "rejection_reason"`);
    }

}
