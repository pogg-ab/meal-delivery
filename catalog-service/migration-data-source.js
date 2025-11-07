// migration-data-source.js
require('dotenv/config');
const { DataSource } = require('typeorm');

// This data source is ONLY for running migrations from the CLI
module.exports = new DataSource({
  type: 'postgres',
  host: process.env.POSTGRES_HOST,
  port: +process.env.POSTGRES_PORT,
  username: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB,

  // --- THIS IS THE FIX ---
  // It now points to the original TypeScript files
  entities: ['src/**/*.entity.ts'],
  migrations: ['src/migrations/*.ts'],
  
  // This tells TypeORM to use ts-node to run the .ts files
  migrationsRun: false, 
  synchronize: false,
});