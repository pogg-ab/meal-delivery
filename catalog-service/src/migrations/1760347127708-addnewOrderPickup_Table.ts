import { MigrationInterface, QueryRunner, Table, TableIndex } from "typeorm";

export class AddnewOrderPickupTable1760347127708 implements MigrationInterface {

   public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'order_pickups',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', default: 'gen_random_uuid()' },
          { name: 'order_id', type: 'uuid', isNullable: false },
          { name: 'pickup_code', type: 'varchar', length: '8', isNullable: false },
          { name: 'pickup_token', type: 'varchar', length: '1024', isNullable: true },
          { name: 'expires_at', type: 'timestamp', isNullable: true },
          { name: 'verified', type: 'boolean', default: false },
          { name: 'verified_by', type: 'uuid', isNullable: true },
          { name: 'verified_at', type: 'timestamp', isNullable: true },
          { name: 'created_at', type: 'timestamp', default: 'now()' },
          { name: 'updated_at', type: 'timestamp', default: 'now()' },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'order_pickups',
      new TableIndex({ name: 'IDX_order_pickups_order_id_unique', columnNames: ['order_id'], isUnique: true }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex('order_pickups', 'IDX_order_pickups_order_id_unique');
    await queryRunner.dropTable('order_pickups');
  }

}
