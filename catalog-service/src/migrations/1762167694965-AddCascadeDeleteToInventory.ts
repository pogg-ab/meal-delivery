import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCascadeDeleteToInventory1762167694965 implements MigrationInterface {
    name = 'AddCascadeDeleteToInventory1762167694965'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "inventory" DROP CONSTRAINT "FK_2f268ad52fab9f5f806cc506775"`);
        await queryRunner.query(`ALTER TABLE "inventory" ADD CONSTRAINT "FK_2f268ad52fab9f5f806cc506775" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "inventory" DROP CONSTRAINT "FK_2f268ad52fab9f5f806cc506775"`);
        await queryRunner.query(`ALTER TABLE "inventory" ADD CONSTRAINT "FK_2f268ad52fab9f5f806cc506775" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

}
