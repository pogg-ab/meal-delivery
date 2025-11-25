import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddbusinessName1762426084236 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'restaurant_subaccounts',
      new TableColumn({
        name: 'business_name',
        type: 'varchar',
        length: '255',
        isNullable: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('restaurant_subaccounts', 'business_name');
  }
}
