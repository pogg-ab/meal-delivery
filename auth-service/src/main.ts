import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { SanitizeInputPipe } from './common/pipes/sanitize-input.pipe';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Trust proxy so app and Passport build correct absolute URLs behind nginx
  app.set('trust proxy', 1);

  // Load env vars via ConfigService (best practice)
  const configService = app.get(ConfigService);
  const PORT = configService.get<number>('PORT', 3000);
  const HOST = configService.get<string>('HOST', '0.0.0.0');
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

  // Lightweight health endpoints (bypass Nest routing) to make deployment probes reliable
  app.use('/health', (_req, res) => res.status(200).json({ status: 'ok' }));
  app.use('/api/health', (_req, res) => res.status(200).json({ status: 'ok' }));

  // Security headers (CSP disabled here to avoid breaking Swagger/assets; enable if you add CSP config)
  app.use(
    helmet({
      contentSecurityPolicy: NODE_ENV === 'production' ? undefined : false,
      crossOriginEmbedderPolicy: false,
    }),
  );

  if (NODE_ENV === 'production') {
    app.use(helmet.hsts({ maxAge: 15552000 })); // 180 days
  }

  // Global sanitization + validation
  app.useGlobalPipes(
    new SanitizeInputPipe(),
    new ValidationPipe({ whitelist: true, transform: true }),
  );

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

  await app.listen(PORT, HOST);
  console.log(`🚀 App running on http://${HOST}:${PORT}`);
  console.log(`📖 Swagger docs: http://${HOST}:${PORT}/api/docs`);
  console.log('Allowed CORS origins:', allowedOrigins.join(', '));
}

bootstrap();
