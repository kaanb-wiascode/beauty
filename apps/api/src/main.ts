import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { PrismaExceptionFilter } from './common/database/prisma-exception.filter';
import { ZodExceptionFilter } from './common/validation/zod-exception.filter';

const LOCAL_CORS_ORIGINS = [
  'http://localhost:3001',
  'http://127.0.0.1:3001',
];

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const express = app.getHttpAdapter().getInstance();

  express.disable('x-powered-by');
  if (process.env.TRUST_PROXY === 'true') {
    express.set('trust proxy', 1);
  }

  app.enableShutdownHooks();

  app.use((request: Request, response: Response, next: NextFunction) => {
    const incomingRequestId = request.header('x-request-id')?.trim();
    const requestId =
      incomingRequestId && incomingRequestId.length <= 128
        ? incomingRequestId
        : randomUUID();

    response.setHeader('x-request-id', requestId);
    response.setHeader('x-content-type-options', 'nosniff');
    response.setHeader('x-frame-options', 'DENY');
    response.setHeader('referrer-policy', 'no-referrer');
    response.setHeader(
      'permissions-policy',
      'camera=(), microphone=(), geolocation=()',
    );
    next();
  });

  app.useGlobalFilters(
    new PrismaExceptionFilter(),
    new ZodExceptionFilter(),
  );

  const configuredOrigins = process.env.CORS_ORIGINS?.split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  app.enableCors({
    origin:
      configuredOrigins && configuredOrigins.length > 0
        ? configuredOrigins
        : LOCAL_CORS_ORIGINS,
    credentials: true,
  });

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
