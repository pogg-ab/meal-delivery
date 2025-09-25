import { MigrationInterface, QueryRunner } from "typeorm";

export class AddMenuInventorySchema1758711381430 implements MigrationInterface {
    name = 'AddMenuInventorySchema1758711381430'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."inventory_logs_change_type_enum" AS ENUM('ORDER_DEDUCTION', 'MANUAL_UPDATE', 'RESTOCK', 'CANCEL_ROLLBACK')`);
        await queryRunner.query(`CREATE TABLE "inventory_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "inventory_id" uuid NOT NULL, "change_type" "public"."inventory_logs_change_type_enum" NOT NULL, "quantity_change" integer NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_06b444680ab11eb7c7d0ed6eced" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "inventory" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "menu_item_id" uuid NOT NULL, "stock_quantity" integer NOT NULL, "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "REL_2f268ad52fab9f5f806cc50677" UNIQUE ("menu_item_id"), CONSTRAINT "PK_82aa5da437c5bbfb80703b08309" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "menu_items" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "category_id" uuid NOT NULL, "name" character varying NOT NULL, "description" text, "price" numeric(10,2) NOT NULL, "is_available" boolean NOT NULL DEFAULT true, "image_url" text, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, CONSTRAINT "PK_57e6188f929e5dc6919168620c8" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "menu_categories" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "restaurant_id" uuid NOT NULL, "name" character varying NOT NULL, "description" text, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, CONSTRAINT "PK_124ae987900336f983881cb04e6" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "restaurants" ("id" uuid NOT NULL, "name" character varying NOT NULL, "owner_id" character varying NOT NULL, "is_active" boolean NOT NULL DEFAULT false, CONSTRAINT "PK_e2133a72eb1cc8f588f7b503e68" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "inventory_logs" ADD CONSTRAINT "FK_1608cc9510a9beab02f165ebfee" FOREIGN KEY ("inventory_id") REFERENCES "inventory"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "inventory" ADD CONSTRAINT "FK_2f268ad52fab9f5f806cc506775" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "menu_items" ADD CONSTRAINT "FK_20cff56c44dd4fe52d5aa2b96f8" FOREIGN KEY ("category_id") REFERENCES "menu_categories"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "menu_categories" ADD CONSTRAINT "FK_a1650861201d802c0ad078fff8e" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "menu_categories" DROP CONSTRAINT "FK_a1650861201d802c0ad078fff8e"`);
        await queryRunner.query(`ALTER TABLE "menu_items" DROP CONSTRAINT "FK_20cff56c44dd4fe52d5aa2b96f8"`);
        await queryRunner.query(`ALTER TABLE "inventory" DROP CONSTRAINT "FK_2f268ad52fab9f5f806cc506775"`);
        await queryRunner.query(`ALTER TABLE "inventory_logs" DROP CONSTRAINT "FK_1608cc9510a9beab02f165ebfee"`);
        await queryRunner.query(`DROP TABLE "restaurants"`);
        await queryRunner.query(`DROP TABLE "menu_categories"`);
        await queryRunner.query(`DROP TABLE "menu_items"`);
        await queryRunner.query(`DROP TABLE "inventory"`);
        await queryRunner.query(`DROP TABLE "inventory_logs"`);
        await queryRunner.query(`DROP TYPE "public"."inventory_logs_change_type_enum"`);
    }

}
