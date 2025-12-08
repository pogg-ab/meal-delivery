import { MigrationInterface, QueryRunner } from "typeorm";

export class MakeOrderEventOrderIdNullable1765191013166 implements MigrationInterface {
    name = 'MakeOrderEventOrderIdNullable1765191013166'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "order_events" DROP CONSTRAINT "FK_b33cbf9a59cbee112d94bcb59de"`);
        await queryRunner.query(`ALTER TABLE "order_events" ALTER COLUMN "order_id" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "order_events" ADD CONSTRAINT "FK_b33cbf9a59cbee112d94bcb59de" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "order_events" DROP CONSTRAINT "FK_b33cbf9a59cbee112d94bcb59de"`);
        await queryRunner.query(`ALTER TABLE "order_events" ALTER COLUMN "order_id" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "order_events" ADD CONSTRAINT "FK_b33cbf9a59cbee112d94bcb59de" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

}
