import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class AddingPaymentdetailOnorder1760694204788 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
// add tx_ref
await queryRunner.addColumn(
'orders',
new TableColumn({
name: 'tx_ref',
type: 'varchar',
length: '255',
isNullable: true,
}),
);


// add checkout_url
await queryRunner.addColumn(
'orders',
new TableColumn({
name: 'checkout_url',
type: 'text',
isNullable: true,
}),
);


// add payment_expires_at
await queryRunner.addColumn(
'orders',
new TableColumn({
name: 'payment_expires_at',
type: 'timestamp',
isNullable: true,
}),
);


// add chapa_tx_id
await queryRunner.addColumn(
'orders',
new TableColumn({
name: 'chapa_tx_id',
type: 'varchar',
length: '255',
isNullable: true,
}),
);


// Note: if you need to extend an existing Postgres enum (payment_status) to include new values,
// you will need to run an ALTER TYPE query. That operation is DB-specific and may require raw SQL.
// The migration above avoids touching the enum type; ensure your code's enum in TS matches DB state.
}


public async down(queryRunner: QueryRunner): Promise<void> {
await queryRunner.dropColumn('orders', 'chapa_tx_id');
await queryRunner.dropColumn('orders', 'payment_expires_at');
await queryRunner.dropColumn('orders', 'checkout_url');
await queryRunner.dropColumn('orders', 'tx_ref');
}

}
