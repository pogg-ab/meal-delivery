import { MigrationInterface, QueryRunner, Table, TableIndex } from "typeorm";

export class AddpayoutItemAndPayoutbatch1761841703256 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
    // Ensure pgcrypto extension exists so we can use gen_random_uuid()
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto";`);

    // Create payout_batches table
    await queryRunner.createTable(
      new Table({
        name: 'payout_batches',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            isNullable: false,
            default: 'gen_random_uuid()',
          },
          {
            name: 'status',
            type: 'varchar',
            length: '50',
            isNullable: false,
            default: `'pending'`,
          },
          {
            name: 'total_amount',
            type: 'numeric',
            precision: 12,
            scale: 2,
            isNullable: false,
            default: `'0'`,
          },
          {
            name: 'provider_batch_id',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'attempt_count',
            type: 'integer',
            isNullable: false,
            default: 0,
          },
          {
            name: 'meta',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            isNullable: false,
            default: 'now()',
          },
          {
            name: 'processed_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            isNullable: false,
            default: 'now()',
          },
        ],
      }),
      true,
    );

    // Create payout_items table
    await queryRunner.createTable(
      new Table({
        name: 'payout_items',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            isNullable: false,
            default: 'gen_random_uuid()',
          },
          {
            name: 'payout_batch_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'order_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'payment_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'restaurant_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'reason',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'parent_item_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'amount',
            type: 'numeric',
            precision: 12,
            scale: 2,
            isNullable: false,
          },
          {
            name: 'status',
            type: 'varchar',
            length: '50',
            isNullable: false,
            default: `'pending'`,
          },
          {
            name: 'account_number',
            type: 'varchar',
            length: '64',
            isNullable: true,
          },
          {
            name: 'account_name',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'bank_code',
            type: 'varchar',
            length: '50',
            isNullable: true,
          },
          {
            name: 'provider_transfer_id',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'provider_response',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'attempt_count',
            type: 'integer',
            isNullable: false,
            default: 0,
          },
          {
            name: 'last_error',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'meta',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            isNullable: false,
            default: 'now()',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            isNullable: false,
            default: 'now()',
          },
        ],
      }),
      true,
    );

    // Indexes for payout_items
    await queryRunner.createIndex(
      'payout_items',
      new TableIndex({
        name: 'idx_payout_items_payout_batch_id',
        columnNames: ['payout_batch_id'],
      }),
    );

    await queryRunner.createIndex(
      'payout_items',
      new TableIndex({
        name: 'idx_payout_items_order_id',
        columnNames: ['order_id'],
      }),
    );

    await queryRunner.createIndex(
      'payout_items',
      new TableIndex({
        name: 'idx_payout_items_restaurant_id',
        columnNames: ['restaurant_id'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.dropIndex('payout_items', 'idx_payout_items_restaurant_id');
    await queryRunner.dropIndex('payout_items', 'idx_payout_items_order_id');
    await queryRunner.dropIndex('payout_items', 'idx_payout_items_payout_batch_id');

    // Drop tables
    await queryRunner.dropTable('payout_items', true);
    await queryRunner.dropTable('payout_batches', true);

    // Note: do NOT drop pgcrypto extension here (it may be used elsewhere)
  }

}
