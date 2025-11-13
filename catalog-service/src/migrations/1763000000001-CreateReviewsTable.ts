import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey } from 'typeorm';

export class CreateReviewsTable1763000000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create reviews table
    await queryRunner.createTable(
      new Table({
        name: 'reviews',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'menu_item_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'customer_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'order_id',
            type: 'uuid',
            isNullable: true,
            comment: 'Reference to the order (optional, for verified purchases)',
          },
          {
            name: 'rating',
            type: 'integer',
            isNullable: false,
            comment: 'Rating from 1 to 5',
          },
          {
            name: 'comment',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'customer_name',
            type: 'varchar',
            length: '255',
            isNullable: true,
            comment: 'Cached customer name for display',
          },
          {
            name: 'is_verified_purchase',
            type: 'boolean',
            default: false,
            comment: 'True if review is linked to an actual order',
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
          {
            name: 'deleted_at',
            type: 'timestamp',
            isNullable: true,
          },
        ],
      }),
      true,
    );

    // Add check constraint for rating (1-5)
    await queryRunner.query(
      `ALTER TABLE "reviews" ADD CONSTRAINT "CHK_reviews_rating" CHECK ("rating" >= 1 AND "rating" <= 5)`,
    );

    // Create foreign key to menu_items
    await queryRunner.createForeignKey(
      'reviews',
      new TableForeignKey({
        columnNames: ['menu_item_id'],
        referencedTableName: 'menu_items',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    // Create foreign key to orders (nullable)
    await queryRunner.createForeignKey(
      'reviews',
      new TableForeignKey({
        columnNames: ['order_id'],
        referencedTableName: 'orders',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );

    // Create index on menu_item_id for faster lookups
    await queryRunner.createIndex(
      'reviews',
      new TableIndex({
        name: 'IDX_reviews_menu_item_id',
        columnNames: ['menu_item_id'],
      }),
    );

    // Create index on customer_id
    await queryRunner.createIndex(
      'reviews',
      new TableIndex({
        name: 'IDX_reviews_customer_id',
        columnNames: ['customer_id'],
      }),
    );

    // Create unique constraint to prevent duplicate reviews per customer per menu item
    await queryRunner.createIndex(
      'reviews',
      new TableIndex({
        name: 'UQ_reviews_customer_menu_item',
        columnNames: ['customer_id', 'menu_item_id'],
        isUnique: true,
        where: '"deleted_at" IS NULL',
      }),
    );

    // Create index for created_at to support sorting by recent reviews
    await queryRunner.createIndex(
      'reviews',
      new TableIndex({
        name: 'IDX_reviews_created_at',
        columnNames: ['created_at'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.dropIndex('reviews', 'IDX_reviews_created_at');
    await queryRunner.dropIndex('reviews', 'UQ_reviews_customer_menu_item');
    await queryRunner.dropIndex('reviews', 'IDX_reviews_customer_id');
    await queryRunner.dropIndex('reviews', 'IDX_reviews_menu_item_id');

    // Drop table (foreign keys will be dropped automatically)
    await queryRunner.dropTable('reviews');
  }
}
