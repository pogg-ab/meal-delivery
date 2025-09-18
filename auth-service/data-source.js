// module.exports = {
//   type: 'postgres',
//   host: process.env.POSTGRES_HOST || 'localhost',
//   port: parseInt(process.env.POSTGRES_PORT, 10) || 5432,
//   username: process.env.POSTGRES_USER || 'postgres',
//   password: process.env.POSTGRES_PASSWORD || '',
//   database: process.env.POSTGRES_DB || 'auth_db',
//   entities: ['dist/**/*.entity{.ts,.js}'],
//   synchronize: true,
//   migrations: ['dist/migrations/*{.ts,.js}'],
//   cli: {
//     migrationsDir: 'src/migrations',
//   },
// }; 

// ormconfig.ts
// import { DataSource } from 'typeorm';
// import * as dotenv from 'dotenv';
// dotenv.config();

// export default new DataSource({
//   type:    'postgres',
//   host:    process.env.POSTGRES_HOST,
//   port:    parseInt(process.env.POSTGRES_PORT || '5432'),
//   username: process.env.POSTGRES_USER,
//   password: process.env.POSTGRES_PASSWORD,
//   database: process.env.POSTGRES_DB,
//   entities: [
//     'src/**/*.entity.{ts,js}',
//     'dist/**/*.entity{.js,.cjs}'
//   ],
//   migrations: [
//     'src/migrations/*.{ts,js}',
//     'dist/migrations/*{.js,.cjs}'
//   ],
// });

// data-source.js
require('dotenv/config');
const { DataSource } = require('typeorm');

module.exports = new DataSource({
  type: 'postgres',
  host: process.env.POSTGRES_HOST,
  port: +process.env.POSTGRES_PORT,
  username: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB,
  entities: ['dist/**/*.entity.js'],
  migrations: ['dist/migrations/*.js'],
});

