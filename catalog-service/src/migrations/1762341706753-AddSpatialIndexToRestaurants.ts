import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSpatialIndexToRestaurants1762341706753 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE INDEX "IDX_restaurants_location"
            ON "restaurants"
            USING GIST (geography(ST_MakePoint(longitude, latitude)));
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_restaurants_location";`);
    }
}