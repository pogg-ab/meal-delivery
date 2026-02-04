import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { MicroserviceOptions } from '@nestjs/microservices';
import { kafkaConfig } from './kafka.config';
import helmet from 'helmet';
import { SanitizeInputPipe } from './common/pipes/sanitize-input.pipe';

const nodeCrypto = require('crypto');
if (!('crypto' in globalThis)) {
  (globalThis as any).crypto = nodeCrypto.webcrypto ?? {
    randomUUID: nodeCrypto.randomUUID,
  };
}

/**
 * Configures and sets up the Swagger UI.
 */
function setupSwagger(app: INestApplication) {
  const configService = app.get(ConfigService);
  const PORT = configService.get<number>('PORT');

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Catalog Service')
    .setDescription('API for restaurants, menus, items, and inventory.')
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'access-token',
    )
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);

  document.servers = [
    {
      url:
        configService.get<string>('SWAGGER_SERVER_URL') ||
        `http://localhost:${PORT}`,
    },
  ];

  SwaggerModule.setup('/api/docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
    customSiteTitle: 'Catalog Service - API Docs',
  });
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const configService = app.get(ConfigService);
  const PORT = configService.get<number>('PORT', 3001);
  const NODE_ENV = configService.get<string>('NODE_ENV', 'development');

  // Honor proxy headers when behind a load balancer
  app.set('trust proxy', 1);

  // Build allowed CORS origins
  const defaultOrigins = [
    'http://localhost:3000',
    'http://localhost:3001',
    `http://localhost:${PORT}`,
  ];
  const envOrigins = (configService.get<string>('CORS_ORIGINS') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const allowedOrigins = envOrigins.length ? envOrigins : defaultOrigins;

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) return callback(null, true);

      if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        return callback(null, true);
      }

      console.warn('[CORS] Blocked origin:', origin);
      return callback(new Error('CORS policy: Origin not allowed'), false);
    },
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type, Authorization, Accept, X-Requested-With',
    exposedHeaders: 'Content-Disposition',
  });

  // Security headers
  app.use(
    helmet({
      contentSecurityPolicy: NODE_ENV === 'production' ? undefined : false,
      crossOriginEmbedderPolicy: false,
    }),
  );

  if (NODE_ENV === 'production') {
    app.use(helmet.hsts({ maxAge: 15552000 })); // 180 days
  }

  app.useGlobalPipes(
    new SanitizeInputPipe(),
    new ValidationPipe({ whitelist: true, transform: true }),
  );

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
