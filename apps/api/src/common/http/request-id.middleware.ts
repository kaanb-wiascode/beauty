import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export const REQUEST_ID_HEADER = 'x-request-id';

export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const incoming = req.header(REQUEST_ID_HEADER)?.trim();
  const requestId = incoming && incoming.length <= 128 ? incoming : randomUUID();

  res.setHeader(REQUEST_ID_HEADER, requestId);
  res.locals.requestId = requestId;
  next();
}
