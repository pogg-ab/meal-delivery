import { MigrationInterface, QueryRunner } from "typeorm";

export class AddTsVectorToMenuItems1763433412767 implements MigrationInterface {
    name = 'AddTsVectorToMenuItems1763433412767'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "menu_items" ADD "document_tsvector" tsvector`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "menu_items" DROP COLUMN "document_tsvector"`);
    }

}
