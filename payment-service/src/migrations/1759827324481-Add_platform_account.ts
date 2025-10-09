import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPlatformAccount1759827324481 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);

await queryRunner.query(`
CREATE TABLE "platform_account" (
"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
"chapa_subaccount_id" character varying(255) NOT NULL,
"raw" jsonb,
"created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
"updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
`);

await queryRunner.query(`
CREATE UNIQUE INDEX "IDX_platform_account_chapa_subaccount_id" ON "platform_account" ("chapa_subaccount_id");
`);


await queryRunner.query(`
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
NEW.updated_at = now();
RETURN NEW;
END;
$$ LANGUAGE plpgsql;
`);

await queryRunner.query(`
CREATE TRIGGER set_timestamp_on_platform_account
BEFORE UPDATE ON "platform_account"
FOR EACH ROW
EXECUTE PROCEDURE trigger_set_timestamp();
`);
}


public async down(queryRunner: QueryRunner): Promise<void> {

await queryRunner.query(`DROP TRIGGER IF EXISTS set_timestamp_on_platform_account ON "platform_account";`);

await queryRunner.query(`DROP FUNCTION IF EXISTS trigger_set_timestamp();`);

await queryRunner.query(`DROP INDEX IF EXISTS "IDX_platform_account_chapa_subaccount_id";`);

await queryRunner.query(`DROP TABLE IF EXISTS "platform_account";`);

  }

}
