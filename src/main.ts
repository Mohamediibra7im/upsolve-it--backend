import { configureHttpApplication } from './common/http/configure-http';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { timingSafeEqual } from 'node:crypto';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { validateEnv } from './config/env.validation';
import type { Request, Response, NextFunction } from 'express';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const logger = app.get(Logger);

  const config = app.get(ConfigService);
  validateEnv(config);
  const port = Number(config.get<string>('PORT') ?? 3000);
  configureHttpApplication(app, config);

  // Swagger / API docs at /docs. Served in every environment.
  // Optional basic-auth gate: set SWAGGER_USER + SWAGGER_PASSWORD to require
  // credentials (recommended in production, since these docs expose the full
  // API surface). Leave them unset to serve the docs openly.
  const swaggerUser = config.get<string>('SWAGGER_USER');
  const swaggerPassword = config.get<string>('SWAGGER_PASSWORD');
  if (swaggerUser && swaggerPassword) {
    app.use(
      ['/docs', '/docs-json'],
      (req: Request, res: Response, next: NextFunction) => {
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
      },
    );
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
