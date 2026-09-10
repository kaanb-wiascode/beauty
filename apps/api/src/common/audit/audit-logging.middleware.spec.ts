import { EventEmitter } from 'node:events';
import type { NextFunction, Request, Response } from 'express';
import { AuditLoggingMiddleware } from './audit-logging.middleware';
import type { AuditLogService } from './audit-log.service';

function createResponse(statusCode: number) {
  const response = new EventEmitter() as EventEmitter & {
    statusCode: number;
    locals: { requestId: string };
  };
  response.statusCode = statusCode;
  response.locals = { requestId: 'request-1' };
  return response as unknown as Response & EventEmitter;
}

describe('AuditLoggingMiddleware', () => {
  it.each([
    ['POST', 201, 'http.post', 'SUCCESS'],
    ['PATCH', 200, 'http.patch', 'SUCCESS'],
    ['DELETE', 204, 'http.delete', 'SUCCESS'],
    ['POST', 400, 'http.post', 'FAILURE'],
    ['GET', 401, 'security.authentication.failed', 'FAILURE'],
    ['GET', 403, 'security.authorization.denied', 'FAILURE'],
  ])('records %s %s as %s', (method, statusCode, action, result) => {
    const record = jest.fn().mockResolvedValue(undefined);
    const middleware = new AuditLoggingMiddleware({ record } as unknown as AuditLogService);
    const response = createResponse(statusCode);
    const request = {
      method,
      path: '/api/customers',
      user: {
        sub: 'user-1',
        tenantId: 'tenant-1',
        companyId: 'company-1',
        branchId: 'branch-1',
      },
    } as unknown as Request;

    middleware.use(request, response, jest.fn() as NextFunction);
    response.emit('finish');

    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        companyId: 'company-1',
        branchId: 'branch-1',
        actorUserId: 'user-1',
        requestId: 'request-1',
        action,
        resource: '/api/customers',
        result,
        statusCode,
      }),
    );
  });

  it('does not persist ordinary GET requests', () => {
    const record = jest.fn().mockResolvedValue(undefined);
    const middleware = new AuditLoggingMiddleware({ record } as unknown as AuditLogService);
    const response = createResponse(200);
    const request = {
      method: 'GET',
      path: '/api/customers',
    } as unknown as Request;

    middleware.use(request, response, jest.fn() as NextFunction);
    response.emit('finish');

    expect(record).not.toHaveBeenCalled();
  });
});
