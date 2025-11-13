import { MigrationInterface, QueryRunner, TableColumn, TableIndex } from 'typeorm';

export class AddRatingFieldsToRestaurantAndMenuItem1763000000002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add rating fields to menu_items table
    await queryRunner.addColumn(
      'menu_items',
      new TableColumn({
        name: 'average_rating',
        type: 'decimal',
        precision: 3,
        scale: 2,
        isNullable: true,
        default: null,
        comment: 'Cached average rating for this menu item',
      }),
    );

    await queryRunner.addColumn(
      'menu_items',
      new TableColumn({
        name: 'total_reviews',
        type: 'integer',
        default: 0,
        comment: 'Cached total number of reviews for this menu item',
      }),
    );

    // Add rating fields to restaurants table
    await queryRunner.addColumn(
      'restaurants',
      new TableColumn({
        name: 'average_rating',
        type: 'decimal',
        precision: 3,
        scale: 2,
        isNullable: true,
        default: null,
        comment: 'Cached average rating derived from all menu item ratings',
      }),
    );

    await queryRunner.addColumn(
      'restaurants',
      new TableColumn({
        name: 'total_reviews',
        type: 'integer',
        default: 0,
        comment: 'Cached total number of reviews across all menu items',
      }),
    );

    // Create indexes for efficient sorting by rating
    await queryRunner.createIndex(
      'menu_items',
      new TableIndex({
        name: 'IDX_menu_items_average_rating',
        columnNames: ['average_rating'],
      }),
    );

    await queryRunner.createIndex(
      'restaurants',
      new TableIndex({
        name: 'IDX_restaurants_average_rating',
        columnNames: ['average_rating'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.dropIndex('restaurants', 'IDX_restaurants_average_rating');
    await queryRunner.dropIndex('menu_items', 'IDX_menu_items_average_rating');

    // Drop columns from restaurants
    await queryRunner.dropColumn('restaurants', 'total_reviews');
    await queryRunner.dropColumn('restaurants', 'average_rating');

    // Drop columns from menu_items
    await queryRunner.dropColumn('menu_items', 'total_reviews');
    await queryRunner.dropColumn('menu_items', 'average_rating');
  }
}
