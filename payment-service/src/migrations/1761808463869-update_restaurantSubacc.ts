import {
  MigrationInterface,
  QueryRunner,
  TableColumn,
  TableIndex,
} from 'typeorm';

export class UpdateRestaurantSubacc1761808463869 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add account_name, account_number, bank_code columns (nullable)
    await queryRunner.addColumns('restaurant_subaccounts', [
      new TableColumn({
        name: 'account_name',
        type: 'varchar',
        length: '255',
        isNullable: true,
      }),
      new TableColumn({
        name: 'account_number',
        type: 'varchar',
        length: '64',
        isNullable: true,
      }),
      new TableColumn({
        name: 'bank_code',
        type: 'varchar',
        length: '50',
        isNullable: true,
      }),
    ]);

    // Create index on account_number (non-unique)
    await queryRunner.createIndex(
      'restaurant_subaccounts',
      new TableIndex({
        name: 'idx_restaurant_subaccounts_account_number',
        columnNames: ['account_number'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop index if it exists
    const table = await queryRunner.getTable('restaurant_subaccounts');
    const existingIndex = table?.indices.find(
      (i) => i.name === 'idx_restaurant_subaccounts_account_number',
    );
    if (existingIndex) {
      await queryRunner.dropIndex('restaurant_subaccounts', existingIndex);
    }

    // Drop columns if they exist
    const columnsToDrop = ['bank_code', 'account_number', 'account_name'];
    for (const col of columnsToDrop) {
      const hasColumn = (
        await queryRunner.getTable('restaurant_subaccounts')
      )?.findColumnByName(col);
      if (hasColumn) {
        await queryRunner.dropColumn('restaurant_subaccounts', col);
      }
    }
  }
}
