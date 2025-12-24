import { MigrationInterface, QueryRunner } from "typeorm";

export class UpdateOrderDefaultStatusToScheduled1763980998803 implements MigrationInterface {
    name = 'UpdateOrderDefaultStatusToScheduled1763980998803'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'SCHEDULED'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'PENDING'`);
    }

}
