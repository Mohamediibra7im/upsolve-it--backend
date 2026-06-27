import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { AppModule } from '../src/app.module';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';

let cachedApp: any;

async function createApp() {
    if (cachedApp) return cachedApp;

    const express = require('express');
    const app = express();
    const adapter = new ExpressAdapter(app);

    const nestApp = await NestFactory.create(AppModule, adapter, {
        logger: false,
    });

    const config = nestApp.get(ConfigService);
    const logger = nestApp.get(Logger);

    nestApp.use(
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
                    'script-src': ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
                    'script-src-attr': ["'unsafe-inline'"],
                    'style-src': ["'self'", 'https:', "'unsafe-inline'"],
                    'upgrade-insecure-requests': [],
                },
            },
        }),
    );
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

    const staticOrigins = [
        frontendOrigin,
        appUrl,
        'http://localhost:3000',
        'http://localhost:3001',
        'http://127.0.0.1:3000',
        'https://upsolve-iit.vercel.app',
        'https://upsolve-it.hnuicpc.tech',
    ].filter(Boolean);

    const vercelWildcard = /^https?:\/\/[a-zA-Z0-9.-]+\.(vercel\.app|hnuicpc\.tech)$/;

    nestApp.enableCors({
        origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
            if (!origin || staticOrigins.includes(origin) || vercelWildcard.test(origin)) {
                callback(null, true);
            } else {
                logger.warn(`CORS blocked origin: ${origin}`);
                callback(new Error('Not allowed by CORS'));
            }
        },
        credentials: true,
    });

    nestApp.setGlobalPrefix('api', { exclude: ['/'] });

    await nestApp.init();
    cachedApp = app;
    return app;
}

export default async function handler(req: any, res: any) {
    const app = await createApp();
    return app(req, res);
}