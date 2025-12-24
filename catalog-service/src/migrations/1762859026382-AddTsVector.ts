import { MigrationInterface, QueryRunner } from "typeorm";

export class AddTsVector1762859026382 implements MigrationInterface {

     public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE restaurants ADD COLUMN document_tsvector tsvector`);
    await queryRunner.query(`CREATE INDEX restaurants_document_tsvector_idx ON restaurants USING GIN (document_tsvector)`);
    await queryRunner.query(`
      CREATE TRIGGER restaurants_vector_update
      BEFORE INSERT OR UPDATE ON restaurants
      FOR EACH ROW
      EXECUTE PROCEDURE tsvector_update_trigger('document_tsvector', 'pg_catalog.english', 'name', 'owner_id')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS restaurants_vector_update ON restaurants`);
    await queryRunner.query(`DROP INDEX IF EXISTS restaurants_document_tsvector_idx`);
    await queryRunner.query(`ALTER TABLE restaurants DROP COLUMN IF EXISTS document_tsvector`);
  }
}
