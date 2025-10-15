// catalog-service/src/main.ts
// import 'dotenv/config';
// import { NestFactory } from '@nestjs/core';
// import { AppModule } from './app.module';
// import { INestApplication, ValidationPipe } from '@nestjs/common';
// import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
// import { ConfigService } from '@nestjs/config';
// import { MicroserviceOptions } from '@nestjs/microservices';
// import { kafkaConfig } from './kafka.config';
// import * as bodyParser from 'body-parser';

// // Polyfill global crypto if needed - This part is fine.
// // eslint-disable-next-line @typescript-eslint/no-var-requires
// const nodeCrypto = require('crypto');
// if (!('crypto' in globalThis)) {
//   (globalThis as any).crypto = nodeCrypto.webcrypto ?? { randomUUID: nodeCrypto.randomUUID };
// }

// /**
//  * Configures and sets up the Swagger UI.
//  */
// function setupSwagger(app: INestApplication) {
//   const configService = app.get(ConfigService);
//   const PORT = configService.get<number>('PORT');

//   const swaggerConfig = new DocumentBuilder()
//     .setTitle('Payment Service')
//     .setDescription('API for Payment processing.')
//     .setVersion('1.0')
//     .addBearerAuth(
//       { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
//       'access-token',
//     )
//     .build();

//   const document = SwaggerModule.createDocument(app, swaggerConfig);

//   document.servers = [{ url: `http://localhost:${PORT}` }];

//   SwaggerModule.setup('/api/docs', app, document, {
//     swaggerOptions: { persistAuthorization: true },
//     customSiteTitle: 'Payment Service - API Docs',
//   });
// }

// async function bootstrap() {
//   const app = await NestFactory.create(AppModule);

//   // app.use(bodyParser.json({ verify: (req: any, _, buf) => { req.rawBody = buf; } }));
//   // app.use(bodyParser.raw({ type: 'application/json' }));
//   // capture raw for application/json (covers charset variants)
//   app.use(
//     bodyParser.raw({
//       type: (req: any) => ((req.headers['content-type'] || '') as string).includes('application/json'),
//       limit: '512kb',
//     }),
//   );

//   // then normal JSON parser for other endpoints
//   app.use(bodyParser.json({ limit: '512kb' }));

//   const configService = app.get(ConfigService);
//   const PORT = configService.get<number>('PORT', 3008);
//   const NODE_ENV = configService.get<string>('NODE_ENV', 'development');

//   app.enableCors();
//   app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

//   // Setup Swagger for development
//   if (NODE_ENV !== 'production') {
//     setupSwagger(app);
//   }
  
//   // Connect and start the Kafka microservice listener
//   app.connectMicroservice<MicroserviceOptions>(kafkaConfig);
//   await app.startAllMicroservices();

//   // Start the HTTP server
//   await app.listen(PORT);
  
//   console.log(`🚀 Payment Service running on http://localhost:${PORT}`);
//   if (NODE_ENV !== 'production') {
//     console.log(`📖 Swagger docs: http://localhost:${PORT}/api/docs`);
//   }
// }

// bootstrap();


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
  (globalThis as any).crypto = nodeCrypto.webcrypto ?? { randomUUID: nodeCrypto.randomUUID };
}

function setupSwagger(app: INestApplication) {
  const configService = app.get(ConfigService);
  const PORT = configService.get<number>('PORT');

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Payment Service')
    .setDescription('API for Payment processing.')
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  document.servers = [{ url: `http://localhost:${PORT}` }];
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
  const NODE_ENV = configService.get<string>('NODE_ENV', 'development');

  app.enableCors();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  if (NODE_ENV !== 'production') {
    setupSwagger(app);
  }

  // Connect and start the Kafka microservice listener
  app.connectMicroservice<MicroserviceOptions>(kafkaConfig);
  await app.startAllMicroservices();

  // Start HTTP server
  await app.listen(PORT);

  console.log(`🚀 Payment Service running on http://localhost:${PORT}`);
  if (NODE_ENV !== 'production') {
    console.log(`📖 Swagger docs: http://localhost:${PORT}/api/docs`);
  }
}

bootstrap();

