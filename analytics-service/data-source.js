// import 'dotenv/config';
// import { DataSource } from 'typeorm';
// import { Plan } from './entities/plan.entity';
// import { Feature } from './entities/feature.entity';
// import { PlanFeature } from './entities/plan-feature.entity';
// import { Subscription } from './entities/subscription.entity';
// import { UsageRecord } from './entities/usage-record.entity';

// export default new DataSource({
// 	type: 'postgres',
// 	host: process.env.POSTGRES_HOST,
// 	port: +(process.env.POSTGRES_PORT ?? 5432),
// 	username: process.env.POSTGRES_USER,
// 	password: process.env.POSTGRES_PASSWORD,
// 	database: process.env.POSTGRES_DB,
// 	// entities: [Plan, Feature, PlanFeature, Subscription, UsageRecord],
// 	entities: ['dist/**/*.entity.js'],
// 	migrations: ['dist/migrations/*{.js,.cjs}'],
// });


require('dotenv/config');
const { DataSource } = require('typeorm');

module.exports = new DataSource({
  type: 'postgres',
  host: process.env.POSTGRES_HOST,
  port: +process.env.POSTGRES_PORT ?? 5432,
  username: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB,
  entities: ['dist/**/*.entity.js'],
  migrations: ['dist/src/migrations/*.js'],
});
