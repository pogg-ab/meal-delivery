import { MigrationInterface, QueryRunner } from "typeorm";

export class AddRestaurantOnboardingSchema1758611310561 implements MigrationInterface {
    name = 'AddRestaurantOnboardingSchema1758611310561'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "addresses" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid, "restaurant_id" uuid, "label" character varying NOT NULL, "street" character varying NOT NULL, "city" character varying NOT NULL, "region" character varying NOT NULL, "country" character varying NOT NULL DEFAULT 'Ethiopia', "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_745d8f43d3af10ab8247465e450" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "restaurant_hours" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "restaurant_id" uuid NOT NULL, "weekday" integer NOT NULL, "open_time" TIME NOT NULL, "close_time" TIME NOT NULL, "is_closed" boolean NOT NULL DEFAULT false, CONSTRAINT "PK_d0ecd0325bfc70180bf301900ee" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "restaurant_documents" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "restaurant_id" uuid NOT NULL, "document_type" character varying NOT NULL, "document_url" character varying NOT NULL, "status" character varying NOT NULL DEFAULT 'PENDING', "uploaded_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_828a116e7dc38999ea8e6f517df" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "restaurant_bank_details" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "restaurant_id" uuid NOT NULL, "account_name" character varying NOT NULL, "account_number" character varying NOT NULL, "bank_name" character varying NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_cfb20a1b2b72a0b0ebc29ef15e6" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."restaurants_status_enum" AS ENUM('PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED')`);
        await queryRunner.query(`CREATE TABLE "restaurants" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "owner_id" uuid NOT NULL, "name" character varying NOT NULL, "description" text NOT NULL, "email" character varying NOT NULL, "phone" character varying NOT NULL, "status" "public"."restaurants_status_enum" NOT NULL DEFAULT 'PENDING', "is_active" boolean NOT NULL DEFAULT false, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_dfeffbef9c31936dbac54733daa" UNIQUE ("name"), CONSTRAINT "UQ_c356f465f786a3ae9ff48ab18ef" UNIQUE ("email"), CONSTRAINT "REL_efe4eead3adf44a4649a3353ef" UNIQUE ("owner_id"), CONSTRAINT "PK_e2133a72eb1cc8f588f7b503e68" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "addresses" ADD CONSTRAINT "FK_16aac8a9f6f9c1dd6bcb75ec023" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "addresses" ADD CONSTRAINT "FK_1b394a5534935b1044005079141" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "restaurant_hours" ADD CONSTRAINT "FK_8f728943ad00977380de696bfea" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "restaurant_documents" ADD CONSTRAINT "FK_f5ca3ce46cfdd7dd51c2264f6ce" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "restaurant_bank_details" ADD CONSTRAINT "FK_8afd9f4439440234d70677fb336" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "restaurants" ADD CONSTRAINT "FK_efe4eead3adf44a4649a3353efc" FOREIGN KEY ("owner_id") REFERENCES "users"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "restaurants" DROP CONSTRAINT "FK_efe4eead3adf44a4649a3353efc"`);
        await queryRunner.query(`ALTER TABLE "restaurant_bank_details" DROP CONSTRAINT "FK_8afd9f4439440234d70677fb336"`);
        await queryRunner.query(`ALTER TABLE "restaurant_documents" DROP CONSTRAINT "FK_f5ca3ce46cfdd7dd51c2264f6ce"`);
        await queryRunner.query(`ALTER TABLE "restaurant_hours" DROP CONSTRAINT "FK_8f728943ad00977380de696bfea"`);
        await queryRunner.query(`ALTER TABLE "addresses" DROP CONSTRAINT "FK_1b394a5534935b1044005079141"`);
        await queryRunner.query(`ALTER TABLE "addresses" DROP CONSTRAINT "FK_16aac8a9f6f9c1dd6bcb75ec023"`);
        await queryRunner.query(`DROP TABLE "restaurants"`);
        await queryRunner.query(`DROP TYPE "public"."restaurants_status_enum"`);
        await queryRunner.query(`DROP TABLE "restaurant_bank_details"`);
        await queryRunner.query(`DROP TABLE "restaurant_documents"`);
        await queryRunner.query(`DROP TABLE "restaurant_hours"`);
        await queryRunner.query(`DROP TABLE "addresses"`);
    }

}
