// catalog-service/src/main.ts
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { MicroserviceOptions } from '@nestjs/microservices';
import { kafkaConfig } from './kafka.config';
import * as bodyParser from 'body-parser';

// Polyfill global crypto if needed - This part is fine.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const nodeCrypto = require('crypto');
if (!('crypto' in globalThis)) {
  (globalThis as any).crypto = nodeCrypto.webcrypto ?? { randomUUID: nodeCrypto.randomUUID };
}

/**
 * Configures and sets up the Swagger UI.
 */
function setupSwagger(app: INestApplication) {
  const configService = app.get(ConfigService);
  const PORT = configService.get<number>('PORT');

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Payment Service')
    .setDescription('API for Payment processing.')
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'access-token',
    )
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);

  document.servers = [{ url: `http://localhost:${PORT}` }];

  SwaggerModule.setup('/api/docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
    customSiteTitle: 'Payment Service - API Docs',
  });
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(bodyParser.json({ verify: (req: any, _, buf) => { req.rawBody = buf; } }));

  const configService = app.get(ConfigService);
  const PORT = configService.get<number>('PORT', 3008);
  const NODE_ENV = configService.get<string>('NODE_ENV', 'development');

  app.enableCors();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Setup Swagger for development
  if (NODE_ENV !== 'production') {
    setupSwagger(app);
  }
  
  // Connect and start the Kafka microservice listener
  app.connectMicroservice<MicroserviceOptions>(kafkaConfig);
  await app.startAllMicroservices();

  // Start the HTTP server
  await app.listen(PORT);
  
  console.log(`🚀 Payment Service running on http://localhost:${PORT}`);
  if (NODE_ENV !== 'production') {
    console.log(`📖 Swagger docs: http://localhost:${PORT}/api/docs`);
  }
}

bootstrap();
