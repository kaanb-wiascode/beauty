import { RequestIdMiddleware } from './request-id.middleware';

describe('RequestIdMiddleware', () => {
  const middleware = new RequestIdMiddleware();

  it('preserves a valid incoming request id', () => {
    const request = {
      header: () => 'client-request-123',
    } as any;
    const response = {
      setHeader: jest.fn(),
    } as any;
    const next = jest.fn();

    middleware.use(request, response, next);

    expect(request.requestId).toBe('client-request-123');
    expect(response.setHeader).toHaveBeenCalledWith('X-Request-Id', 'client-request-123');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('generates a request id when one is missing', () => {
    const request = {
      header: () => undefined,
    } as any;
    const response = {
      setHeader: jest.fn(),
    } as any;
    const next = jest.fn();

    middleware.use(request, response, next);

    expect(request.requestId).toEqual(expect.any(String));
    expect(response.setHeader).toHaveBeenCalledWith('X-Request-Id', request.requestId);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
