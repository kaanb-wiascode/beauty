import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { PrismaExceptionFilter } from '../src/common/database/prisma-exception.filter';
import { ZodExceptionFilter } from '../src/common/validation/zod-exception.filter';

jest.setTimeout(90_000);

describe('Mobile session revocation contract (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const fixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = fixture.createNestApplication();
    app.useGlobalFilters(new PrismaExceptionFilter(), new ZodExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  async function issueSession(label: string) {
    const suffix = randomUUID().replace(/-/g, '').slice(0, 12);
    const email = `mobile-${label}-${suffix}@example.test`;
    const password = 'MobileTestStrong2026!';
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email,
        password,
        firstName: 'Mobile',
        lastName: 'Security',
        tenantName: `Mobile Security ${label} ${suffix}`,
        tenantSlug: `mobile-security-${label}-${suffix}`,
      })
      .expect(201);

    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(201);

    return response.body as {
      accessToken: string;
      refreshToken?: string;
      sessionId: string;
      tenant: { id: string };
      membership: { id: string };
    };
  }

  it('issues an owned session ID without sharing the refresh cookie secret', async () => {
    const current = await issueSession('self');
    expect(current.sessionId).toMatch(/^[a-f0-9]{64}$/);
    expect(current.sessionId).not.toBe(current.refreshToken);

    const list = await request(app.getHttpServer())
      .get('/auth/sessions')
      .set('Authorization', `Bearer ${current.accessToken}`)
      .expect(200);

    expect(list.body).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: current.sessionId }),
    ]));

    const revoke = await request(app.getHttpServer())
      .post(`/auth/sessions/${current.sessionId}/revoke`)
      .set('Authorization', `Bearer ${current.accessToken}`)
      .expect(201);
    expect(revoke.body).toEqual({ id: current.sessionId, revoked: true });

    // A revoked refresh session must invalidate its already-issued access JWT.
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${current.accessToken}`)
      .expect(401);
    await request(app.getHttpServer())
      .get('/appointments')
      .set('Authorization', `Bearer ${current.accessToken}`)
      .expect(401);

    if (current.refreshToken) {
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: current.refreshToken })
        .expect(401);
    }
  });

  it('rotates access JWT session bindings and rejects the older bearer token', async () => {
    const first = await issueSession('rotate');
    expect(first.refreshToken).toBeDefined();

    const refreshed = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: first.refreshToken })
      .expect(201);
    const renewed = refreshed.body as {
      accessToken: string;
      refreshToken: string;
      sessionId: string;
    };
    expect(renewed.sessionId).toMatch(/^[a-f0-9]{64}$/);
    expect(renewed.sessionId).not.toBe(first.sessionId);

    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${first.accessToken}`)
      .expect(401);

    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${renewed.accessToken}`)
      .expect(200);
  });

  it('lists multiple own sessions and revokes another without affecting the current session', async () => {
    const suffix = randomUUID().replace(/-/g, '').slice(0, 12);
    const email = `session-list-${suffix}@example.test`;
    const password = 'MobileTestStrong2026!';
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email,
        password,
        firstName: 'Mobile',
        lastName: 'Sessions',
        tenantName: `Mobile Sessions ${suffix}`,
        tenantSlug: `mobile-sessions-${suffix}`,
      })
      .expect(201);

    const firstResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(201);
    const secondResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(201);
    const first = firstResponse.body as { accessToken: string; sessionId: string };
    const second = secondResponse.body as { accessToken: string; sessionId: string };
    expect(first.sessionId).not.toBe(second.sessionId);

    const before = await request(app.getHttpServer())
      .get('/auth/sessions')
      .set('Authorization', `Bearer ${first.accessToken}`)
      .expect(200);
    expect(before.body).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: first.sessionId }),
      expect.objectContaining({ id: second.sessionId }),
    ]));

    await request(app.getHttpServer())
      .post(`/auth/sessions/${second.sessionId}/revoke`)
      .set('Authorization', `Bearer ${first.accessToken}`)
      .expect(201)
      .expect({ id: second.sessionId, revoked: true });

    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${second.accessToken}`)
      .expect(401);
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${first.accessToken}`)
      .expect(200);

    const remaining = await request(app.getHttpServer())
      .get('/auth/sessions')
      .set('Authorization', `Bearer ${first.accessToken}`)
      .expect(200);
    expect(remaining.body.map((session: { id: string }) => session.id)).toContain(first.sessionId);
    expect(remaining.body.map((session: { id: string }) => session.id)).not.toContain(second.sessionId);
  });

  it('refuses to revoke another tenant session using a different tenant JWT', async () => {
    const owner = await issueSession('owner');
    const stranger = await issueSession('stranger');

    await request(app.getHttpServer())
      .post(`/auth/sessions/${owner.sessionId}/revoke`)
      .set('Authorization', `Bearer ${stranger.accessToken}`)
      .expect(404);

    const list = await request(app.getHttpServer())
      .get('/auth/sessions')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(200);
    expect(list.body).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: owner.sessionId }),
    ]));
  });
});
