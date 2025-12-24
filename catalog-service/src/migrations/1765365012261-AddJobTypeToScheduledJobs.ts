import { MigrationInterface, QueryRunner } from "typeorm";

export class AddJobTypeToScheduledJobs1765365012261 implements MigrationInterface {
    name = 'AddJobTypeToScheduledJobs1765365012261'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."scheduled_jobs_jobtype_enum" AS ENUM('PROCESS_SCHEDULED_ORDER', 'CANCEL_UNPAID_ORDER')`);
        await queryRunner.query(`ALTER TABLE "scheduled_jobs" ADD "jobType" "public"."scheduled_jobs_jobtype_enum" NOT NULL DEFAULT 'PROCESS_SCHEDULED_ORDER'`);
        await queryRunner.query(`ALTER TABLE "scheduled_jobs" ADD "meta" jsonb`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "scheduled_jobs" DROP COLUMN "meta"`);
        await queryRunner.query(`ALTER TABLE "scheduled_jobs" DROP COLUMN "jobType"`);
        await queryRunner.query(`DROP TYPE "public"."scheduled_jobs_jobtype_enum"`);
    }

}
