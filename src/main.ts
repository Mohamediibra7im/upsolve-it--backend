import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { json, urlencoded } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { timingSafeEqual } from 'node:crypto';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { validateEnv } from './config/env.validation';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const logger = app.get(Logger);

  // Behind a single reverse proxy (nginx/Caddy) — trust exactly one hop so
  // req.ip reflects the real client, not the proxy. Required for correct
  // per-IP rate limiting; raw X-Forwarded-For headers are client-spoofable
  // and must not be trusted.
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
          // Swagger UI spins up a web worker from a blob URL; without this it
          // falls back to default-src 'self' and the docs page breaks.
          'worker-src': ["'self'", 'blob:'],
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
    'https://mohamediibrahim.dev',
    'https://www.mohamediibrahim.dev',
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

  // Swagger / API docs at /docs. Served in every environment.
  // Optional basic-auth gate: set SWAGGER_USER + SWAGGER_PASSWORD to require
  // credentials (recommended in production, since these docs expose the full
  // API surface). Leave them unset to serve the docs openly.
  const swaggerUser = config.get<string>('SWAGGER_USER');
  const swaggerPassword = config.get<string>('SWAGGER_PASSWORD');
  if (swaggerUser && swaggerPassword) {
    app.use(['/docs', '/docs-json'], (req, res, next) => {
      const header = req.headers.authorization ?? '';
      const [scheme, encoded] = header.split(' ');
      const safeEqual = (a: string, b: string) => {
        const ab = Buffer.from(a);
        const bb = Buffer.from(b);
        return ab.length === bb.length && timingSafeEqual(ab, bb);
      };
      if (scheme === 'Basic' && encoded) {
        const [user, pass] = Buffer.from(encoded, 'base64')
          .toString()
          .split(':');
        if (
          safeEqual(user ?? '', swaggerUser) &&
          safeEqual(pass ?? '', swaggerPassword)
        ) {
          return next();
        }
      }
      res
        .set('WWW-Authenticate', 'Basic realm="Upsolve.it API Docs"')
        .status(401)
        .send('Authentication required');
    });
  }

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
    swaggerOptions: { persistAuthorization: true },
  });

  // Bind 0.0.0.0 so the reverse proxy (and Docker) can reach the app.
  await app.listen(port, '0.0.0.0');
  logger.log(`Application is running on: http://0.0.0.0:${port}`);
}

bootstrap().catch((err) => {
  // Logger not guaranteed available if bootstrap fails; keep console.error
  console.error('Failed to bootstrap application:', err);
  process.exit(1);
});
