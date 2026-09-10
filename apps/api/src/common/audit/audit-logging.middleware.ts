import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { AuditLogService } from './audit-log.service';

type RequestUserContext = {
  sub?: string;
  userId?: string;
  tenantId?: string;
  companyId?: string;
  branchId?: string | null;
};

function getUserContext(request: Request): RequestUserContext {
  return (
    (request as Request & { user?: RequestUserContext }).user ?? {}
  );
}

function isAuditableMethod(method: string): boolean {
  return method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';
}

@Injectable()
export class AuditLoggingMiddleware implements NestMiddleware {
  constructor(private readonly auditLog: AuditLogService) {}

  use(request: Request, response: Response, next: NextFunction): void {
    response.on('finish', () => {
      const statusCode = response.statusCode;
      const securityEvent = statusCode === 401 || statusCode === 403;

      if (!securityEvent && !isAuditableMethod(request.method)) {
        return;
      }

      const user = getUserContext(request);
      const action = securityEvent
        ? statusCode === 401
          ? 'security.authentication.failed'
          : 'security.authorization.denied'
        : `http.${request.method.toLowerCase()}`;

      void this.auditLog.record({
        tenantId: user.tenantId,
        companyId: user.companyId,
        branchId: user.branchId,
        actorUserId: user.sub ?? user.userId,
        requestId: response.locals.requestId as string | undefined,
        action,
        resource: request.path,
        result: statusCode >= 400 ? 'FAILURE' : 'SUCCESS',
        statusCode,
        metadata: {
          method: request.method,
        },
      });
    });

    next();
  }
}
