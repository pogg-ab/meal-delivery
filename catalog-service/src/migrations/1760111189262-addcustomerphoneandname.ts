import { MigrationInterface, QueryRunner } from "typeorm";

export class Addcustomerphoneandname1760111189262 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN "customer_name" character varying(255)`
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN "customer_phone" character varying(50)`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "customer_phone"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "customer_name"`);
  }
}
