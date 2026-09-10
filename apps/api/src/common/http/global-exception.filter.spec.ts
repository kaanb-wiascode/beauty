import { BadRequestException, InternalServerErrorException } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import { ZodError } from 'zod';
import { GlobalExceptionFilter } from './global-exception.filter';

describe('GlobalExceptionFilter', () => {
  const createHost = () => {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const response = { status, locals: { requestId: 'request-123' } };
    const request = {
      method: 'GET',
      originalUrl: '/api/example',
      header: jest.fn().mockReturnValue(undefined),
    };

    const host = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as unknown as ArgumentsHost;

    return { host, status, json };
  };

  it('hides internal details from unexpected errors', () => {
    const filter = new GlobalExceptionFilter();
    const { host, status, json } = createHost();

    filter.catch(new Error('database password=secret'), host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Internal server error',
      requestId: 'request-123',
    }));
    expect(JSON.stringify(json.mock.calls[0][0])).not.toContain('database password=secret');
  });

  it('hides internal details from explicit 5xx HttpExceptions', () => {
    const filter = new GlobalExceptionFilter();
    const { host, status, json } = createHost();

    filter.catch(new InternalServerErrorException('Prisma connection string leaked'), host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({
      statusCode: 500,
      message: 'Internal server error',
    }));
    expect(JSON.stringify(json.mock.calls[0][0])).not.toContain('Prisma connection string leaked');
  });

  it('preserves safe client error messages', () => {
    const filter = new GlobalExceptionFilter();
    const { host, status, json } = createHost();

    filter.catch(new BadRequestException('Invalid inventory quantity'), host);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Invalid inventory quantity',
    }));
  });

  it('normalizes Zod validation issues into a safe 400 response', () => {
    const filter = new GlobalExceptionFilter();
    const { host, status, json } = createHost();
    const error = new ZodError([
      { code: 'too_small', minimum: 1, inclusive: true, origin: 'string', path: ['name'], message: 'Too short' },
    ]);

    filter.catch(error, host);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({
      statusCode: 400,
      message: ['name: Too short'],
    }));
  });
});
