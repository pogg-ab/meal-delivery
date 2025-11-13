
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { MicroserviceOptions } from '@nestjs/microservices';
import { kafkaConfig } from './kafka.config';

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
    .setTitle('Catalog Service') // <-- Specific to Catalog Service
    .setDescription('API for restaurants, menus, items, and inventory.') // <-- Specific to Catalog Service
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);

  // This line reads from your .env file
  document.servers = [{ url: configService.get<string>('SWAGGER_SERVER_URL') || `http://localhost:${PORT}` }];

  SwaggerModule.setup('/api/docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
    customSiteTitle: 'Catalog Service - API Docs', // <-- Specific to Catalog Service
  });
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const PORT = configService.get<number>('PORT', 3001);
  const NODE_ENV = configService.get<string>('NODE_ENV', 'development');

  // Use a simple, permissive CORS for now
  app.enableCors();

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  if (NODE_ENV !== 'production') {
    setupSwagger(app);
  }

  // Connect and start the Kafka microservice listener
  try {
    app.connectMicroservice<MicroserviceOptions>(kafkaConfig);
    await app.startAllMicroservices();
  } catch (error) {
    console.warn('Failed to connect to Kafka, running without microservices');
  }

  // Listen publicly on all network interfaces
  await app.listen(PORT, '0.0.0.0');

  console.log(`🚀 Catalog Service running on http://localhost:${PORT}`);
  if (NODE_ENV !== 'production') {
    console.log(`📖 Swagger docs: http://localhost:${PORT}/api/docs`);
  }
}

bootstrap();
