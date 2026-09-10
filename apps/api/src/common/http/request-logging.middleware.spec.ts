import { EventEmitter } from 'node:events';
import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { RequestLoggingMiddleware } from './request-logging.middleware';

function createResponse(statusCode: number, requestId = 'request-123') {
  const response = new EventEmitter() as EventEmitter & {
    statusCode: number;
    locals: { requestId: string };
  };
  response.statusCode = statusCode;
  response.locals = { requestId };
  return response as unknown as Response & EventEmitter;
}

describe('RequestLoggingMiddleware', () => {
  const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
  const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();

  afterEach(() => {
    log.mockClear();
    warn.mockClear();
    error.mockClear();
  });

  afterAll(() => {
    log.mockRestore();
    warn.mockRestore();
    error.mockRestore();
  });

  it('logs completed requests with correlation and tenant context without query strings', () => {
    const middleware = new RequestLoggingMiddleware();
    const response = createResponse(200);
    const request = {
      method: 'GET',
      path: '/api/products',
      url: '/api/products?secret=should-not-be-logged',
      user: { id: 'user-1', tenantId: 'tenant-1' },
    } as unknown as Request;
    const next = jest.fn() as NextFunction;

    middleware.use(request, response, next);
    response.emit('finish');

    expect(next).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]?.[0]).toContain('http.request.completed');
    expect(log.mock.calls[0]?.[0]).toContain('request-123');
    expect(log.mock.calls[0]?.[0]).toContain('user-1');
    expect(log.mock.calls[0]?.[0]).toContain('tenant-1');
    expect(log.mock.calls[0]?.[0]).not.toContain('secret=should-not-be-logged');
  });

  it.each([
    [401, 'security.authentication.failed'],
    [403, 'security.authorization.denied'],
  ])('marks %s responses as security events', (statusCode, event) => {
    const middleware = new RequestLoggingMiddleware();
    const response = createResponse(statusCode);
    const request = {
      method: 'POST',
      path: '/api/auth/login',
    } as unknown as Request;

    middleware.use(request, response, jest.fn() as NextFunction);
    response.emit('finish');

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain(event);
    expect(log).not.toHaveBeenCalled();
  });

  it('logs server failures at error level', () => {
    const middleware = new RequestLoggingMiddleware();
    const response = createResponse(500);
    const request = {
      method: 'GET',
      path: '/api/health',
    } as unknown as Request;

    middleware.use(request, response, jest.fn() as NextFunction);
    response.emit('finish');

    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0]?.[0]).toContain('http.request.completed');
    expect(log).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });
});
