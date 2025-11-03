import { MigrationInterface, QueryRunner, Table, TableIndex } from "typeorm";

export class AddPayoutChildandAggregate1762160968960 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
    // 1) Create payout_batches
    await queryRunner.createTable(
    new Table({
    name: 'payout_batches',
    columns: [
    { name: 'id', type: 'uuid', isPrimary: true, isGenerated: true, generationStrategy: 'uuid' },
    { name: 'status', type: 'varchar', length: '50', isNullable: false, default: "'pending'" },
    { name: 'total_amount', type: 'decimal', precision: 12, scale: 2, isNullable: false, default: '0' },
    { name: 'provider_batch_id', type: 'varchar', length: '255', isNullable: true },
    { name: 'attempt_count', type: 'integer', isNullable: false, default: 0 },
    { name: 'meta', type: 'jsonb', isNullable: true },
    { name: 'created_at', type: 'timestamp', default: 'now()' },
    { name: 'processed_at', type: 'timestamp', isNullable: true },
    { name: 'updated_at', type: 'timestamp', default: 'now()' },
    ],
    }),
    );
    
    
    // 2) Create aggregated_payouts (parents)
    await queryRunner.createTable(
    new Table({
    name: 'aggregated_payouts',
    columns: [
    { name: 'id', type: 'uuid', isPrimary: true, isGenerated: true, generationStrategy: 'uuid' },
    { name: 'payout_batch_id', type: 'uuid', isNullable: true },
    { name: 'restaurant_id', type: 'uuid', isNullable: false },
    { name: 'amount', type: 'decimal', precision: 12, scale: 2, isNullable: false, default: '0' },
    { name: 'account_number', type: 'varchar', length: '64', isNullable: true },
    { name: 'account_name', type: 'varchar', length: '255', isNullable: true },
    { name: 'bank_code', type: 'varchar', length: '50', isNullable: true },
    { name: 'provider_transfer_id', type: 'varchar', length: '255', isNullable: true },
    { name: 'provider_response', type: 'jsonb', isNullable: true },
    { name: 'status', type: 'varchar', length: '50', isNullable: false, default: "'batched'" },
    { name: 'attempt_count', type: 'integer', isNullable: false, default: 0 },
    { name: 'last_error', type: 'text', isNullable: true },
    { name: 'meta', type: 'jsonb', isNullable: true },
    { name: 'created_at', type: 'timestamp', default: 'now()' },
    { name: 'updated_at', type: 'timestamp', default: 'now()' },
    ],
    }),
    );
    
    
    await queryRunner.createIndex('aggregated_payouts', new TableIndex({ columnNames: ['payout_batch_id'] }));
    await queryRunner.createIndex('aggregated_payouts', new TableIndex({ columnNames: ['restaurant_id'] }));
    
    
    // 3) Create payout_children (children)
    await queryRunner.createTable(
    new Table({
    name: 'payout_children',
    columns: [
    { name: 'id', type: 'uuid', isPrimary: true, isGenerated: true, generationStrategy: 'uuid' },
    { name: 'order_id', type: 'uuid', isNullable: true },
    { name: 'payment_id', type: 'uuid', isNullable: true },
    { name: 'restaurant_id', type: 'uuid', isNullable: false },
    { name: 'amount', type: 'decimal', precision: 12, scale: 2, isNullable: false, default: '0' },
    { name: 'status', type: 'varchar', length: '50', isNullable: false, default: "'pending'" },
    { name: 'parent_aggregate_id', type: 'uuid', isNullable: true },
    { name: 'reason', type: 'varchar', length: '255', isNullable: true },
    { name: 'meta', type: 'jsonb', isNullable: true },
    { name: 'created_at', type: 'timestamp', default: 'now()' },
    { name: 'updated_at', type: 'timestamp', default: 'now()' },
    ],
    }),
    );
    
    
    await queryRunner.createIndex('payout_children', new TableIndex({ columnNames: ['restaurant_id'] }));
    await queryRunner.createIndex('payout_children', new TableIndex({ columnNames: ['parent_aggregate_id'] }));
    await queryRunner.createIndex('payout_children', new TableIndex({ columnNames: ['status'] }));
    
    
    // done
    }
    
    public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('payout_children');
    await queryRunner.dropTable('aggregated_payouts');
    await queryRunner.dropTable('payout_batches');
      }

}
