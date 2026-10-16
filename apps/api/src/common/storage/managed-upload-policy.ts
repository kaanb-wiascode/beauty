import { BadRequestException } from '@nestjs/common';

const BLOCKED_MIME_TYPES = new Set([
  'application/javascript',
  'application/x-javascript',
  'application/x-msdownload',
  'application/x-sh',
  'application/xhtml+xml',
  'image/svg+xml',
  'text/html',
  'text/javascript',
]);

const BLOCKED_PREFIXES = [
  'application/x-executable',
  'application/x-dosexec',
  'application/vnd.microsoft.portable-executable',
];

export function managedMimeType(value?: string | null) {
  const mimeType = value?.trim().toLowerCase() || 'application/octet-stream';
  if (!/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(mimeType)) {
    throw new BadRequestException('mimeType is invalid.');
  }
  if (
    BLOCKED_MIME_TYPES.has(mimeType) ||
    BLOCKED_PREFIXES.some((prefix) => mimeType.startsWith(prefix))
  ) {
    throw new BadRequestException('This content type is not allowed in managed private storage.');
  }
  return mimeType;
}
