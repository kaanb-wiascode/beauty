import { randomUUID } from 'node:crypto';

export type PlatformRequestLike = {
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
};

export type PlatformOperationContext = {
  requestId: string;
  sourceIp: string | null;
  userAgent: string | null;
};

const safeHeader = (value: string | string[] | undefined, max = 500) => {
  const normalized = Array.isArray(value) ? value[0] : value;
  if (!normalized) return null;
  const trimmed = normalized.trim();
  return trimmed ? trimmed.slice(0, max) : null;
};

export function getPlatformOperationContext(
  request: PlatformRequestLike,
): PlatformOperationContext {
  const incomingRequestId = safeHeader(request.headers?.['x-request-id'], 120);
  return {
    requestId: incomingRequestId ?? randomUUID(),
    sourceIp: request.ip?.trim().slice(0, 120) || null,
    userAgent: safeHeader(request.headers?.['user-agent'], 500),
  };
}
