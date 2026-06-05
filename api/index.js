const express = require('express');
const { NestFactory } = require('@nestjs/core');
const { ExpressAdapter } = require('@nestjs/platform-express');
const { ValidationPipe } = require('@nestjs/common');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const { DocumentBuilder, SwaggerModule } = require('@nestjs/swagger');

let cachedHandler;

async function bootstrap() {
  if (cachedHandler) return cachedHandler;

  const { AppModule } = require('../dist/app.module');
  const { HttpExceptionFilter } = require('../dist/common/filters/http-exception.filter');

  const expressApp = express();
  const adapter = new ExpressAdapter(expressApp);

  const nestApp = await NestFactory.create(AppModule, adapter, {
    logger: false,
  });

  const config = nestApp.get('ConfigService');

  nestApp.use(helmet({ contentSecurityPolicy: false }));
  nestApp.use(cookieParser());
  nestApp.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
  );
  nestApp.useGlobalFilters(new HttpExceptionFilter());

  const frontendOrigin = config.get('FRONTEND_ORIGIN') ?? '';
  const appUrl = config.get('APP_URL') ?? '';

  const allowedOrigins = [
    frontendOrigin,
    appUrl,
    'http://localhost:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3000',
  ].filter(Boolean);

  nestApp.enableCors({
    origin: (origin, callback) => {
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

module.exports = async function handler(req, res) {
  const app = await bootstrap();
  return app(req, res);
};
