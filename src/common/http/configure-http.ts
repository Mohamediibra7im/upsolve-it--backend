import {
  INestApplication,
  ValidationPipe,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { json, urlencoded } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { HttpExceptionFilter } from '../filters/http-exception.filter';

export function configureHttpApplication(
  app: INestApplication,
  config: ConfigService,
) {
  app.getHttpAdapter().getInstance().set('trust proxy', 1);
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
          'worker-src': ["'self'", 'blob:'],
          'style-src': ["'self'", 'https:', "'unsafe-inline'"],
          'upgrade-insecure-requests': [],
        },
      },
    }),
  );
  app.use(cookieParser());
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
  const development = config.get<string>('NODE_ENV') !== 'production';
  const origins = new Set([
    'https://upsolve-iit.vercel.app',
    'https://upsolve-it.hnuicpc.tech',
    'https://upsolve-it-backend.fly.dev',
    'https://mohamediibrahim.dev',
    'https://www.mohamediibrahim.dev',
    ...(development
      ? [
          'http://localhost:3000',
          'http://localhost:3001',
          'http://127.0.0.1:3000',
        ]
      : []),
  ]);
  const configured = [
    config.get<string>('FRONTEND_ORIGIN'),
    config.get<string>('APP_URL'),
    ...(config.get<string>('CORS_ORIGINS') ?? '').split(','),
  ];
  for (const value of configured) {
    if (!value?.trim()) continue;
    const url = new URL(value.trim());
    if (
      url.username ||
      url.password ||
      !['https:', ...(development ? ['http:'] : [])].includes(url.protocol) ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    )
      throw new Error('CORS origins must be exact HTTP(S) origins');
    origins.add(url.origin);
  }
  app.enableCors({
    credentials: true,
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin || origins.has(origin)) callback(null, true);
      else callback(new ForbiddenException('Origin is not allowed'));
    },
  });
  app.setGlobalPrefix('api', { exclude: ['/'] });
}
