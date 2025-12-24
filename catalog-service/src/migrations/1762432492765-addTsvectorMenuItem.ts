import { MigrationInterface, QueryRunner } from "typeorm";

export class AddTsvectorMenuItem1762432492765 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
// 1️⃣ Add tsvector column
await queryRunner.query(`ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS document_tsvector tsvector`);


// 2️⃣ Create or replace trigger function
await queryRunner.query(`
CREATE OR REPLACE FUNCTION update_menu_item_tsvector() RETURNS trigger AS $$
BEGIN
NEW.document_tsvector := to_tsvector('english', coalesce(NEW.name, ''));
RETURN NEW;
END
$$ LANGUAGE plpgsql;
`);


// 3️⃣ Drop existing trigger if it exists
await queryRunner.query(`DROP TRIGGER IF EXISTS menu_items_tsvector_trigger ON menu_items;`);


// 4️⃣ Create trigger on insert or update
await queryRunner.query(`
CREATE TRIGGER menu_items_tsvector_trigger
BEFORE INSERT OR UPDATE ON menu_items
FOR EACH ROW EXECUTE FUNCTION update_menu_item_tsvector();
`);


// 5️⃣ Optionally populate existing rows
await queryRunner.query(`
UPDATE menu_items SET document_tsvector = to_tsvector('english', coalesce(name, ''));
`);
}


public async down(queryRunner: QueryRunner): Promise<void> {
await queryRunner.query(`DROP TRIGGER IF EXISTS menu_items_tsvector_trigger ON menu_items`);
await queryRunner.query(`DROP FUNCTION IF EXISTS update_menu_item_tsvector()`);
await queryRunner.query(`ALTER TABLE menu_items DROP COLUMN IF EXISTS document_tsvector`);
}
}
