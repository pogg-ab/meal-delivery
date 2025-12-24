import { MigrationInterface, QueryRunner } from "typeorm";

export class AddTsVectorToRestaurants1763430285274 implements MigrationInterface {
    name = 'AddTsVectorToRestaurants1763430285274'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "restaurants" ADD "document_tsvector" tsvector`);
        await queryRunner.query(`ALTER TYPE "public"."orders_status_enum" RENAME TO "orders_status_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."orders_status_enum" AS ENUM('PENDING', 'DECLINED', 'ACCEPTED', 'AWAITING_PAYMENT', 'PAID', 'PREPARING', 'READY', 'CUSTOMER_COMING', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'COMPLETED', 'SCHEDULED')`);
        await queryRunner.query(`ALTER TABLE "orders" ALTER COLUMN "status" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "orders" ALTER COLUMN "status" TYPE "public"."orders_status_enum" USING "status"::"text"::"public"."orders_status_enum"`);
        await queryRunner.query(`ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'PENDING'`);
        await queryRunner.query(`DROP TYPE "public"."orders_status_enum_old"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."orders_status_enum_old" AS ENUM('PENDING', 'DECLINED', 'ACCEPTED', 'AWAITING_PAYMENT', 'PAID', 'PREPARING', 'READY', 'CUSTOMER_COMING', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'COMPLETED')`);
        await queryRunner.query(`ALTER TABLE "orders" ALTER COLUMN "status" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "orders" ALTER COLUMN "status" TYPE "public"."orders_status_enum_old" USING "status"::"text"::"public"."orders_status_enum_old"`);
        await queryRunner.query(`ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'PENDING'`);
        await queryRunner.query(`DROP TYPE "public"."orders_status_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."orders_status_enum_old" RENAME TO "orders_status_enum"`);
        await queryRunner.query(`ALTER TABLE "restaurants" DROP COLUMN "document_tsvector"`);
    }

}
