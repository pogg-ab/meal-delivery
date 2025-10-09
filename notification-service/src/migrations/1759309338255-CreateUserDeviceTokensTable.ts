import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateUserDeviceTokensTable1759309338255 implements MigrationInterface {
    name = 'CreateUserDeviceTokensTable1759309338255'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "user_device_tokens" ("id" SERIAL NOT NULL, "user_id" integer NOT NULL, "device_token" text NOT NULL, "platform" character varying(20) NOT NULL, "last_active" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_f7d7bedebd700108152247816a0" UNIQUE ("device_token"), CONSTRAINT "PK_089ca63b045947b89c77b06a79d" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_0fdbbe2123d6d62dfa270ea894" ON "user_device_tokens" ("user_id") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_0fdbbe2123d6d62dfa270ea894"`);
        await queryRunner.query(`DROP TABLE "user_device_tokens"`);
    }

}
