import { MigrationInterface, QueryRunner } from "typeorm";

export class FixUsernameUseTable1761891257591 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop any UNIQUE CONSTRAINT on users(username) if it exists (search by name containing 'username')
    await queryRunner.query(`
      DO $$
      DECLARE cname text;
      BEGIN
        SELECT conname INTO cname
        FROM pg_constraint
        WHERE conrelid = 'users'::regclass
          AND contype = 'u'
          AND conname ILIKE '%username%';
        IF cname IS NOT NULL THEN
          EXECUTE format('ALTER TABLE public.users DROP CONSTRAINT %I', cname);
        END IF;
      END
      $$;
    `);

    // Drop a few common unique index names if present (no-op if not found)
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_username";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_users_username";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "users_username_key";`);
    // (If your project uses a different naming convention, add it above)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Recreate unique constraint on username (will fail if duplicate usernames exist)
    await queryRunner.query(`
      ALTER TABLE public.users
      ADD CONSTRAINT "UQ_users_username" UNIQUE (username);
    `);
  }
}
