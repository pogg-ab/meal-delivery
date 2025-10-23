import { MigrationInterface, QueryRunner } from "typeorm";

export class SetupAdvancedSearchSchema1761208491041 implements MigrationInterface { // <-- Rename to match your filename

    public async up(queryRunner: QueryRunner): Promise<void> {
        // --- From AddAddressAndRatingToRestaurants ---
        await queryRunner.query(`ALTER TABLE "restaurants" ADD "address" TEXT`);
        await queryRunner.query(`ALTER TABLE "restaurants" ADD "rating" NUMERIC(2,1) DEFAULT 0.0`);

        // --- From AddSearchFunctionality ---
        await queryRunner.query(`ALTER TABLE "restaurants" ADD "document_tsvector" tsvector`);
        await queryRunner.query(`ALTER TABLE "menu_items" ADD "document_tsvector" tsvector`);

        await queryRunner.query(`
            CREATE OR REPLACE FUNCTION update_restaurant_tsvector()
            RETURNS TRIGGER AS $$
            BEGIN
                NEW.document_tsvector := to_tsvector('english', NEW.name);
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
        `);

        await queryRunner.query(`
            CREATE OR REPLACE FUNCTION update_menu_item_tsvector()
            RETURNS TRIGGER AS $$
            BEGIN
                NEW.document_tsvector := to_tsvector('english', NEW.name);
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
        `);

        await queryRunner.query(`
            CREATE TRIGGER restaurant_tsvector_update
            BEFORE INSERT OR UPDATE ON "restaurants"
            FOR EACH ROW EXECUTE FUNCTION update_restaurant_tsvector();
        `);

        await queryRunner.query(`
            CREATE TRIGGER menu_item_tsvector_update
            BEFORE INSERT OR UPDATE ON "menu_items"
            FOR EACH ROW EXECUTE FUNCTION update_menu_item_tsvector();
        `);

        await queryRunner.query(`CREATE INDEX "restaurant_document_tsvector_idx" ON "restaurants" USING GIN(document_tsvector);`);
        await queryRunner.query(`CREATE INDEX "menu_item_document_tsvector_idx" ON "menu_items" USING GIN(document_tsvector);`);
        
        // Populate tsvector for any existing data
        await queryRunner.query(`UPDATE "restaurants" SET document_tsvector = to_tsvector('english', name);`);
        await queryRunner.query(`UPDATE "menu_items" SET document_tsvector = to_tsvector('english', name);`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."menu_item_document_tsvector_idx";`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."restaurant_document_tsvector_idx";`);
        await queryRunner.query(`DROP TRIGGER IF EXISTS "menu_item_tsvector_update" ON "menu_items";`);
        await queryRunner.query(`DROP TRIGGER IF EXISTS "restaurant_tsvector_update" ON "restaurants";`);
        await queryRunner.query(`DROP FUNCTION IF EXISTS "public"."update_menu_item_tsvector"();`);
        await queryRunner.query(`DROP FUNCTION IF EXISTS "public"."update_restaurant_tsvector"();`);
        await queryRunner.query(`ALTER TABLE "menu_items" DROP COLUMN "document_tsvector"`);
        await queryRunner.query(`ALTER TABLE "restaurants" DROP COLUMN "document_tsvector"`);
        await queryRunner.query(`ALTER TABLE "restaurants" DROP COLUMN "rating"`);
        await queryRunner.query(`ALTER TABLE "restaurants" DROP COLUMN "address"`);
    }
}