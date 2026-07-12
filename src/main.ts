import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { json, urlencoded } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { validateEnv } from './config/env.validation';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const logger = app.get(Logger);

  // Behind Fly.io's proxy — trust exactly one hop so req.ip reflects the real
  // client, not the proxy. Required for correct per-IP rate limiting; raw
  // X-Forwarded-For headers are client-spoofable and must not be trusted.
  app.set('trust proxy', 1);

  const config = app.get(ConfigService);
  validateEnv(config);
  const port = Number(config.get<string>('PORT') ?? 3000);
  const frontendOrigin =
    config.get<string>('FRONTEND_ORIGIN') ?? 'http://localhost:3001';
  const appUrl = config.get<string>('APP_URL') ?? '';

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          'default-src': ["'self'"],
          'base-uri': ["'self'"],
          'font-src': ["'self'", 'https:', 'data:'],
          'form-action': ["'self'"],
          'frame-ancestors': ["'self'"],
          'img-src': ["'self'", 'data:', 'https:'],
          'object-src': ["'none'"],
          'script-src': ["'self'", "'unsafe-inline'"],
          'script-src-attr': ["'unsafe-inline'"],
          'style-src': ["'self'", 'https:', "'unsafe-inline'"],
          'upgrade-insecure-requests': [],
        },
      },
    }),
  );
  app.use(cookieParser());
  // Bound request body size to blunt large-payload abuse.
  app.use(json({ limit: '100kb' }));
  app.use(urlencoded({ extended: true, limit: '100kb' }));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());

  const staticOrigins = [
    frontendOrigin,
    appUrl,
    'http://localhost:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3000',
    'https://upsolve-iit.vercel.app',
    'https://upsolve-it.hnuicpc.tech',
  ].filter(Boolean);

  // Only this project's Vercel previews and our own hnuicpc.tech subdomains.
  // A blanket `*.vercel.app` match would let ANY attacker-deployed Vercel site
  // make credentialed cross-origin requests to authenticated cookies.
  const vercelWildcard = /^https:\/\/upsolve-i{1,2}t[a-z0-9-]*\.vercel\.app$/;
  const hnuicpcWildcard = /^https:\/\/[a-z0-9-]+\.hnuicpc\.tech$/;

  app.enableCors({
    origin: (origin, callback) => {
      if (
        !origin ||
        staticOrigins.includes(origin) ||
        vercelWildcard.test(origin) ||
        hnuicpcWildcard.test(origin)
      ) {
        callback(null, true);
      } else {
        logger.warn(`CORS blocked origin: ${origin}`);
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  });
  app.setGlobalPrefix('api', { exclude: ['/'] });

  // Swagger Configuration — disabled in production
  if (process.env.NODE_ENV !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Upsolve.it - Intelligence Engine')
      .setDescription(
        'The scalable intelligence engine powering the Upsolve.it tactical platform.',
      )
      .setVersion('2.0')
      .addTag('Intelligence')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document, {
      customSiteTitle: 'Upsolve.it - Protocol Docs',
    });
  }

  // ponytail: 0.0.0.0 required for Fly.io/Docker — proxy connects from outside
  await app.listen(port, '0.0.0.0');
  logger.log(`Application is running on: http://0.0.0.0:${port}`);
}

bootstrap().catch((err) => {
  // Logger not guaranteed available if bootstrap fails; keep console.error
  console.error('Failed to bootstrap application:', err);
  process.exit(1);
});
