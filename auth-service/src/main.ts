
// main.ts
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Load env vars via ConfigService (best practice)
  const configService = app.get(ConfigService);
  const PORT = configService.get<number>('PORT', 3000);
  const NODE_ENV = configService.get<string>('NODE_ENV', 'development');

  // Serve uploads (static assets)
  app.useStaticAssets(join(__dirname, '..', 'uploads'), {
    prefix: '/uploads',
  });

  // Build allowed CORS origins
  const defaultOrigins = [
    'http://localhost:3001',
    `http://localhost:${PORT}`,
  ];
  const envOrigins = (configService.get<string>('CORS_ORIGINS') || '')
    .split(',')
    .map(s => s.trim())
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

  // Global validation
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // --- Swagger setup ---
  const swaggerConfig = new DocumentBuilder()
    .setTitle('My App API')
    .setDescription('API documentation for My App')
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'access-token',
    )
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);

  // Point Swagger "Try it out" to the correct server
  document.servers = [
    { url: configService.get<string>('SWAGGER_SERVER_URL') || `http://localhost:${PORT}` },
  ];

  // Swagger UI (disabled in prod unless explicitly allowed)
  if (NODE_ENV !== 'production' || configService.get<boolean>('ENABLE_SWAGGER', false)) {
    SwaggerModule.setup('/api/docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
      customSiteTitle: 'My App - API Docs',
    });
  }

  await app.listen(PORT);
  console.log(`🚀 App running on http://localhost:${PORT}`);
  console.log(`📖 Swagger docs: http://localhost:${PORT}/api/docs`);
  console.log('Allowed CORS origins:', allowedOrigins.join(', '));
}

bootstrap();
