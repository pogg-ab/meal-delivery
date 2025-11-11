import { MigrationInterface, QueryRunner } from "typeorm";

export class AddNulltoOrder1762432858869 implements MigrationInterface {
public async up(queryRunner: QueryRunner): Promise<void> {
await queryRunner.query(`ALTER TABLE order_events ALTER COLUMN order_id DROP NOT NULL`);
 }

public async down(queryRunner: QueryRunner): Promise<void> {
await queryRunner.query(`ALTER TABLE order_events ALTER COLUMN order_id SET NOT NULL`);
}

}
