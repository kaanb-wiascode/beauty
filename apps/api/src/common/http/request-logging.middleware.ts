import { Injectable, Logger, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

interface RequestUserContext {
  id?: string;
  userId?: string;
  tenantId?: string;
}

function getUserContext(request: Request): RequestUserContext {
  const user = (request as Request & { user?: RequestUserContext }).user;
  return user ?? {};
}

@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(request: Request, response: Response, next: NextFunction): void {
    const startedAt = process.hrtime.bigint();
    const requestId = response.locals.requestId as string | undefined;

    response.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      const user = getUserContext(request);
      const statusCode = response.statusCode;
      const event = {
        event: 'http.request.completed',
        requestId,
        method: request.method,
        path: request.path,
        statusCode,
        durationMs: Math.round(durationMs * 100) / 100,
        userId: user.userId ?? user.id,
        tenantId: user.tenantId,
      };

      if (statusCode >= 500) {
        this.logger.error(JSON.stringify(event));
      } else if (statusCode === 401 || statusCode === 403) {
        this.logger.warn(
          JSON.stringify({
            ...event,
            event: statusCode === 401 ? 'security.authentication.failed' : 'security.authorization.denied',
          }),
        );
      } else {
        this.logger.log(JSON.stringify(event));
      }
    });

    next();
  }
}
