import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { AppModule } from '../dist/app.module';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { HttpExceptionFilter } from '../dist/common/filters/http-exception.filter';
import express from 'express';

let cachedHandler: any;

async function bootstrap() {
  if (cachedHandler) return cachedHandler;

  const expressApp = express();
  const adapter = new ExpressAdapter(expressApp);

  const nestApp = await NestFactory.create(AppModule, adapter, {
    logger: false,
  });

  const config = nestApp.get(ConfigService);

  nestApp.use(helmet({ contentSecurityPolicy: false }));
  nestApp.use(cookieParser());
  nestApp.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
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
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  });

  nestApp.setGlobalPrefix('api', { exclude: ['/', '/docs', '/docs-json'] });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Upsolve.it - Intelligence Engine')
    .setDescription(
      'The scalable intelligence engine powering the Upsolve.it tactical platform.',
    )
    .setVersion('2.0')
    .addTag('Intelligence')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(nestApp, swaggerConfig);
  SwaggerModule.setup('docs', nestApp, document, {
    customSiteTitle: 'Upsolve.it - Protocol Docs',
  });

  await nestApp.init();

  cachedHandler = expressApp;
  return expressApp;
}

export default async function handler(req: any, res: any) {
  const app = await bootstrap();
  return app(req, res);
}
