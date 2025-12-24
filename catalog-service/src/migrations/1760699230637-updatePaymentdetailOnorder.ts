import { MigrationInterface, QueryRunner } from "typeorm";

export class UpdatePaymentdetailOnorder1760699230637 implements MigrationInterface {

   public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE "orders_payment_status_enum" RENAME TO "orders_payment_status_enum_old";`);

    await queryRunner.query(
      `CREATE TYPE "orders_payment_status_enum" AS ENUM('NONE','PENDING','INITIATED','EXPIRED','PAID','FAILED');`
    );

    await queryRunner.query(`ALTER TABLE "orders" ALTER COLUMN "payment_status" DROP DEFAULT;`);

    await queryRunner.query(
      `ALTER TABLE "orders" ALTER COLUMN "payment_status" TYPE "orders_payment_status_enum" USING ("payment_status"::text::"orders_payment_status_enum");`
    );

    await queryRunner.query(`ALTER TABLE "orders" ALTER COLUMN "payment_status" SET DEFAULT 'NONE';`);

    await queryRunner.query(`DROP TYPE "orders_payment_status_enum_old";`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const oldTypeValues = ['NONE','PENDING','FAILED','REFUNDED'];

    await queryRunner.query(
      `CREATE TYPE "orders_payment_status_enum_old" AS ENUM(${oldTypeValues.map(v => `'${v}'`).join(',')});`
    );

    await queryRunner.query(`ALTER TABLE "orders" ALTER COLUMN "payment_status" DROP DEFAULT;`);

    await queryRunner.query(
      `ALTER TABLE "orders" ALTER COLUMN "payment_status" TYPE "orders_payment_status_enum_old" USING ("payment_status"::text::"orders_payment_status_enum_old");`
    );

    await queryRunner.query(`ALTER TABLE "orders" ALTER COLUMN "payment_status" SET DEFAULT 'NONE';`);
    await queryRunner.query(`DROP TYPE "orders_payment_status_enum";`);
    await queryRunner.query(`ALTER TYPE "orders_payment_status_enum_old" RENAME TO "orders_payment_status_enum";`);
  }
}
