import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { AppModule } from '../src/app.module';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import express from 'express';

let cachedApp: any;

async function createApp() {
  if (cachedApp) return cachedApp;

  const expressApp = express();
  const adapter = new ExpressAdapter(expressApp);

  const nestApp = await NestFactory.create(AppModule, adapter, {
    logger: false,
  });

  const config = nestApp.get(ConfigService);
  const logger = nestApp.get(Logger);

  nestApp.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }));
  nestApp.use(cookieParser());
  nestApp.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );
  nestApp.useGlobalFilters(new HttpExceptionFilter());

  const frontendOrigin = config.get<string>('FRONTEND_ORIGIN') ?? '';
  const appUrl = config.get<string>('APP_URL') ?? '';

  const allowedOrigins = [
    frontendOrigin,
    appUrl,
    'http://localhost:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3000',
  ].filter(Boolean);

  nestApp.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        logger.warn(`CORS blocked origin: ${origin}`);
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  });

  nestApp.setGlobalPrefix('api', { exclude: ['/docs', '/docs-json', '/'] });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Upsolve.it - Intelligence Engine')
    .setDescription('The scalable intelligence engine powering the Upsolve.it tactical platform.')
    .setVersion('2.0')
    .addTag('Intelligence')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(nestApp, swaggerConfig);

  expressApp.get('/docs-json', (_req, res) => {
    res.json(document);
  });

  SwaggerModule.setup('docs', nestApp, document, {
    customSiteTitle: 'Upsolve.it - Protocol Docs',
  });

  await nestApp.init();
  cachedApp = expressApp;
  return expressApp;
}

export default async function handler(req: any, res: any) {
  const app = await createApp();
  return app(req, res);
}
