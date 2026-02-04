import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { MicroserviceOptions } from '@nestjs/microservices';
import { kafkaConfig } from './kafka.config';
import * as bodyParser from 'body-parser';

// Polyfill global crypto if needed
// eslint-disable-next-line @typescript-eslint/no-var-requires
const nodeCrypto = require('crypto');
if (!('crypto' in globalThis)) {
  (globalThis as any).crypto = nodeCrypto.webcrypto ?? {
    randomUUID: nodeCrypto.randomUUID,
  };
}

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

  // --- START OF FIX ---
  // REMOVED: The hardcoded list that caused the issue on deployment.
  // document.servers = [
  //   { url: `http://localhost:${PORT}` },
  //   { url: `https://mealsystem.basirahtv.com/payment` },
  // ];

  // ADDED: The robust, environment-aware configuration from your working catalog-service.
  const swaggerServerUrl = configService.get<string>('SWAGGER_SERVER_URL');
  document.servers = [{ url: swaggerServerUrl || `http://localhost:${PORT}` }];
  // --- END OF FIX ---

  SwaggerModule.setup('/api/docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
    customSiteTitle: 'Payment Service - API Docs',
  });
}

async function bootstrap() {
  // IMPORTANT: disable Nest's automatic body parser so our middleware ordering controls things.
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  // Mount a route-limited raw parser for the webhook. This will set req.body to a Buffer.
  app.use(
    '/webhook/chapa',
    bodyParser.raw({
      // Accept any content-type for webhook so charset variants don't break us
      type: () => true,
      limit: '1mb',
    }),
  );

  // Ensure req.rawBody exists (useful for signature verification code that expects req.rawBody)
  app.use('/webhook/chapa', (req: any, _res, next) => {
    if (req && req.body && Buffer.isBuffer(req.body)) {
      req.rawBody = req.body;
    }
    next();
  });

  // Normal JSON parser for the rest of the app
  app.use(bodyParser.json({ limit: '1mb' }));

  const configService = app.get(ConfigService);
  const PORT = configService.get<number>('PORT', 3008);

  // app.enableCors();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Always enable Swagger
  setupSwagger(app);

  // Connect and start the Kafka microservice listener
  app.connectMicroservice<MicroserviceOptions>(kafkaConfig);
  await app.startAllMicroservices();

  // Start HTTP server
  await app.listen(PORT);

  console.log(`🚀 Payment Service running on http://localhost:${PORT}`);
  console.log(`📖 Swagger docs: http://localhost:${PORT}/api/docs`);
  console.log(
    `📖 Production Swagger docs: https://mealsystem.basirahtv.com/payment/api/docs`,
  );
}

bootstrap().catch((err) => {
  console.error('Error starting server:', err);
  process.exit(1);
});
