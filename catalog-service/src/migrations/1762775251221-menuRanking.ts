import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from "typeorm";

export class MenuRanking1762775251221 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
    // 1) create table
    await queryRunner.createTable(
      new Table({
        name: 'customer_menu_ranking',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'uuid',
          },
          {
            name: 'customer_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'menu_item_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'order_count',
            type: 'integer',
            isNullable: false,
            default: 0,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    // 2) unique index on (customer_id, menu_item_id)
    await queryRunner.createIndex(
      'customer_menu_ranking',
      new TableIndex({
        name: 'idx_customer_menu_unique',
        columnNames: ['customer_id', 'menu_item_id'],
        isUnique: true,
      }),
    );

    // 3) optional FK to menu_items(id) — safe to add if menu_items table exists
    // If you prefer not to enforce FK, remove the next block.
    await queryRunner.createForeignKey(
      'customer_menu_ranking',
      new TableForeignKey({
        columnNames: ['menu_item_id'],
        referencedTableName: 'menu_items',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        name: 'fk_customer_menu_ranking_menu_item',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    
    const table = await queryRunner.getTable('customer_menu_ranking');
    const fk = table?.foreignKeys.find((f) => f.name === 'fk_customer_menu_ranking_menu_item');
    if (fk) {
      await queryRunner.dropForeignKey('customer_menu_ranking', fk);
    }

    await queryRunner.dropIndex('customer_menu_ranking', 'idx_customer_menu_unique');

    await queryRunner.dropTable('customer_menu_ranking', true);
  }

}
