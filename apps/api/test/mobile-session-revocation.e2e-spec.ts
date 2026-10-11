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

    const after = await request(app.getHttpServer())
      .get('/auth/sessions')
      .set('Authorization', `Bearer ${current.accessToken}`)
      .expect(200);
    expect(after.body).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: current.sessionId }),
    ]));

    if (current.refreshToken) {
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: current.refreshToken })
        .expect(401);
    }
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
