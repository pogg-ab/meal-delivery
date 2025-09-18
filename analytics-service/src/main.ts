import 'dotenv/config';
console.log('> RUNNING WITH KAFKA_BROKER =', process.env.KAFKA_BROKER);
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { MicroserviceOptions } from '@nestjs/microservices';
import { kafkaConfig } from './kafka.config';

// Polyfill global crypto only if missing (Node <20). Avoid overriding on Node 20+.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const nodeCrypto = require('crypto');
if (!('crypto' in globalThis)) {
  // @ts-ignore
  (globalThis as any).crypto = nodeCrypto.webcrypto ?? { randomUUID: nodeCrypto.randomUUID };
}

async function bootstrap() {
  // Hybrid app: HTTP + Kafka microservice
  const app = await NestFactory.create(AppModule);
  app.connectMicroservice<MicroserviceOptions>(kafkaConfig);
  await app.startAllMicroservices();
  await app.listen(process.env.PORT ?? 3005); 

}
bootstrap();
