import { Body, Controller, Post } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { z } from 'zod';
import { ZodValidationPipe } from '../src/common/pipes/zod-validation.pipe.js';
import { createTestApp, type FakePrisma } from './create-test-app.js';

const EchoSchema = z.object({ text: z.string().min(1).max(20) });

/** Test-only route: throttled by the global guard and validated by the zod pipe. */
@Controller('echo')
class EchoController {
  @Post()
  echo(@Body(new ZodValidationPipe(EchoSchema)) body: z.infer<typeof EchoSchema>) {
    return body;
  }
}

const UUID = /^[0-9a-f-]{36}$/;

describe('API foundation (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: FakePrisma;

  beforeEach(async () => {
    ({ app, prisma } = await createTestApp({
      controllers: [EchoController],
      env: { RATE_LIMIT_PER_MINUTE: '5' },
    }));
  });

  afterEach(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  describe('health', () => {
    it('GET /api/health → 200 without touching the database', async () => {
      await http().get('/api/health').expect(200).expect({ status: 'ok' });
      expect(prisma.isHealthy).not.toHaveBeenCalled();
    });

    it('GET /api/health/ready → 200 when the database is up', async () => {
      await http()
        .get('/api/health/ready')
        .expect(200)
        .expect({ status: 'ok', checks: { database: 'up' } });
    });

    it('GET /api/health/ready → 503 when the database is down', async () => {
      prisma.isHealthy.mockResolvedValue(false);
      await http()
        .get('/api/health/ready')
        .expect(503)
        .expect({ status: 'degraded', checks: { database: 'down' } });
    });

    it('is exempt from rate limiting (polled by the platform)', async () => {
      for (let i = 0; i < 8; i++) await http().get('/api/health').expect(200);
    });
  });

  describe('request ID', () => {
    it('generates one and returns it in header and error body', async () => {
      const res = await http().get('/api/does-not-exist').expect(404);
      expect(res.headers['x-request-id']).toMatch(UUID);
      expect(res.body.error.requestId).toBe(res.headers['x-request-id']);
    });

    it('propagates a well-formed caller ID', async () => {
      const res = await http().get('/api/health').set('x-request-id', 'trace-abc-123').expect(200);
      expect(res.headers['x-request-id']).toBe('trace-abc-123');
    });

    it('replaces a malformed caller ID (log-injection safe)', async () => {
      const res = await http()
        .get('/api/health')
        .set('x-request-id', 'bad id <script>')
        .expect(200);
      expect(res.headers['x-request-id']).toMatch(UUID);
    });
  });

  describe('error contract', () => {
    it('unknown route → 404 NOT_FOUND', async () => {
      const res = await http().get('/api/nope').expect(404);
      expect(res.body).toEqual({
        error: { code: 'NOT_FOUND', message: 'Resource not found', requestId: expect.any(String) },
      });
    });

    it('invalid body → 400 VALIDATION_FAILED with paths, input not echoed', async () => {
      const res = await http()
        .post('/api/echo')
        .send({ text: 'x'.repeat(21) })
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
      expect(res.body.error.details).toEqual([{ path: 'text', message: expect.any(String) }]);
      expect(JSON.stringify(res.body)).not.toContain('x'.repeat(21));
    });

    it('malformed JSON → 400 BAD_REQUEST without parser internals', async () => {
      const res = await http()
        .post('/api/echo')
        .set('content-type', 'application/json')
        .send('{"text": ')
        .expect(400);
      expect(res.body.error).toMatchObject({ code: 'BAD_REQUEST', message: 'Malformed request' });
      expect(res.body.error.requestId).toMatch(UUID);
    });

    it('body over 16kb → 413 PAYLOAD_TOO_LARGE', async () => {
      const res = await http()
        .post('/api/echo')
        .send({ text: 'x'.repeat(17 * 1024) })
        .expect(413);
      expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
    });
  });

  describe('security', () => {
    it('sets security headers and hides the framework', async () => {
      const res = await http().get('/api/health').expect(200);
      expect(res.headers['x-powered-by']).toBeUndefined();
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['content-security-policy']).toBeDefined();
      expect(res.headers['strict-transport-security']).toBeDefined();
    });

    it('allows CORS only for allowlisted origins', async () => {
      const allowed = await http().get('/api/health').set('Origin', 'http://localhost:3000');
      expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:3000');

      const denied = await http().get('/api/health').set('Origin', 'https://evil.example');
      expect(denied.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('rate-limits per client → 429 RATE_LIMITED', async () => {
      for (let i = 0; i < 5; i++) await http().post('/api/echo').send({ text: 'hi' }).expect(201);
      const res = await http().post('/api/echo').send({ text: 'hi' }).expect(429);
      expect(res.body.error).toMatchObject({ code: 'RATE_LIMITED', requestId: expect.any(String) });
    });
  });
});
