import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSSOFields1766466912739 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "users"
            ADD COLUMN "provider" character varying(20),
            ADD COLUMN "provider_id" character varying(100),
            ADD COLUMN "profile_picture" text
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "users"
            DROP COLUMN "provider",
            DROP COLUMN "provider_id",
            DROP COLUMN "profile_picture"
        `);
    }

}
