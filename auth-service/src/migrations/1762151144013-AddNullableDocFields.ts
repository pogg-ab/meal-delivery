import { MigrationInterface, QueryRunner } from "typeorm";

export class AddNullableDocFields1762151144013 implements MigrationInterface {
    name = 'AddNullableDocFields1762151144013'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "restaurants" DROP CONSTRAINT "CHK_restaurants_average_rating_range"`);
        await queryRunner.query(`ALTER TABLE "restaurant_documents" ADD "original_name" character varying`);
        await queryRunner.query(`ALTER TABLE "restaurant_documents" ADD "mimetype" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "restaurant_documents" DROP COLUMN "mimetype"`);
        await queryRunner.query(`ALTER TABLE "restaurant_documents" DROP COLUMN "original_name"`);
        await queryRunner.query(`ALTER TABLE "restaurants" ADD CONSTRAINT "CHK_restaurants_average_rating_range" CHECK (((average_rating >= (0)::numeric) AND (average_rating <= (5)::numeric)))`);
    }

}
