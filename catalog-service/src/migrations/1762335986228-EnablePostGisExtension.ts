import { MigrationInterface, QueryRunner } from "typeorm";

export class EnablePostGisExtension1762335986228 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        // This command enables all the PostGIS functions in our database
        await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS postgis;`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // This allows us to reverse the change if needed
        await queryRunner.query(`DROP EXTENSION IF EXISTS postgis;`);
    }

}