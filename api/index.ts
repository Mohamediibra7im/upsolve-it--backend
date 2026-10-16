import { configureHttpApplication } from '../src/common/http/configure-http';
import express from 'express';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { AppModule } from '../src/app.module';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

let cachedApp: any;

async function createApp() {
  if (cachedApp) return cachedApp;

  const app = express();
  const adapter = new ExpressAdapter(app);

  const nestApp = await NestFactory.create(AppModule, adapter, {
    logger: false,
  });

  const config = nestApp.get(ConfigService);

  configureHttpApplication(nestApp, config);

  // Generate and serve OpenAPI spec as JSON (no UI — use any OpenAPI viewer)
  const openApiConfig = new DocumentBuilder()
    .setTitle('Upsolve.it - Intelligence Engine')
    .setDescription(
      'The scalable intelligence engine powering the Upsolve.it tactical platform.',
    )
    .setVersion('2.0')
    .addTag('Intelligence')
    .addBearerAuth()
    .build();

  const openApiDocument = SwaggerModule.createDocument(nestApp, openApiConfig);
  app.get('/docs-json', (_req, res) => res.json(openApiDocument));

  await nestApp.init();
  cachedApp = app;
  return app;
}

export default async function handler(req: any, res: any) {
  const app = await createApp();
  return app(req, res);
}
