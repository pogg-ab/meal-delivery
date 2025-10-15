import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateMenuInventoryHistory1760008320236 implements MigrationInterface {
    name = 'CreateMenuInventoryHistory1760008320236'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "menu_inventory_history" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "menuItemId" uuid NOT NULL, "restaurantId" uuid NOT NULL, "batchDate" date NOT NULL, "openingStock" integer NOT NULL, "soldQuantity" integer NOT NULL DEFAULT '0', "manualAdjustments" integer NOT NULL DEFAULT '0', "closingStock" integer NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_0a29ee7ac64550c40c4cf2afb23" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_84162e51f7e2da49817e1931d4" ON "menu_inventory_history" ("restaurantId", "batchDate") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_84162e51f7e2da49817e1931d4"`);
        await queryRunner.query(`DROP TABLE "menu_inventory_history"`);
    }

}
