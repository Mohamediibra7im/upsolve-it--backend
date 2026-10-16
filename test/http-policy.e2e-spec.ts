import { Controller, Get, Post, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { configureHttpApplication } from '../src/common/http/configure-http';

@Controller('probe')
class ProbeController {
  @Get() get() {
    return { ok: true };
  }
  @Post() post() {
    return { ok: true };
  }
}

describe('shared production HTTP policy', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ProbeController],
    }).compile();
    app = module.createNestApplication();
    configureHttpApplication(
      app,
      new ConfigService({
        NODE_ENV: 'production',
        FRONTEND_ORIGIN: 'https://upsolve-it.hnuicpc.tech',
      }),
    );
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });
  it.each([
    'https://upsolve-it-review-attacker.vercel.app',
    'https://evil.hnuicpc.tech',
    'https://upsolve-it-backend-attacker.fly.dev',
    'http://localhost:3000',
    'null',
  ])('blocks credentialed requests from %s', async (origin) => {
    const response = await request(app.getHttpServer())
      .post('/api/probe')
      .set('Origin', origin)
      .type('form')
      .send({});
    expect(response.status).toBe(403);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
  it('permits trusted preflights and originless health clients', async () => {
    const preflight = await request(app.getHttpServer())
      .options('/api/probe')
      .set('Origin', 'https://upsolve-it.hnuicpc.tech')
      .set('Access-Control-Request-Method', 'POST')
      .expect(204);
    expect(preflight.headers['access-control-allow-origin']).toBe(
      'https://upsolve-it.hnuicpc.tech',
    );
    expect(preflight.headers['access-control-allow-credentials']).toBe('true');
    await request(app.getHttpServer()).get('/api/probe').expect(200);
  });
});
