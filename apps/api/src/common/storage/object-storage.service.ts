import { createHash, createHmac } from 'node:crypto';

import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type StorageConfig = {
  bucket: string;
  region: string;
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
  ttlSeconds: number;
  maxBytes: number;
};

type RequestParts = {
  url: URL;
  canonicalUri: string;
  host: string;
};

const SERVICE = 's3';
const ALGORITHM = 'AWS4-HMAC-SHA256';
const UNSIGNED_PAYLOAD = 'UNSIGNED-PAYLOAD';

function sha256(value: string) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function hmac(key: Buffer | string, value: string) {
  return createHmac('sha256', key).update(value, 'utf8').digest();
}

function awsEncode(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function encodeKey(key: string) {
  return key
    .split('/')
    .map((segment) => awsEncode(segment))
    .join('/');
}

function amzDate(date: Date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

function dateStamp(date: Date) {
  return amzDate(date).slice(0, 8);
}

function compareLexical(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

@Injectable()
export class ObjectStorageService {
  private cached?: StorageConfig;

  constructor(private readonly config: ConfigService) {}

  private settings(): StorageConfig {
    if (this.cached) return this.cached;
    const bucket = this.config.get<string>('OBJECT_STORAGE_BUCKET')?.trim();
    const accessKeyId = this.config.get<string>('OBJECT_STORAGE_ACCESS_KEY_ID')?.trim();
    const secretAccessKey = this.config.get<string>('OBJECT_STORAGE_SECRET_ACCESS_KEY')?.trim();
    if (!bucket || !accessKeyId || !secretAccessKey) {
      throw new ServiceUnavailableException('Private object storage is not configured.');
    }
    const ttlRaw = Number(this.config.get<string>('OBJECT_STORAGE_PRESIGN_TTL_SECONDS') ?? 300);
    const maxRaw = Number(this.config.get<string>('OBJECT_STORAGE_MAX_BYTES') ?? 26_214_400);
    this.cached = {
      bucket,
      region: this.config.get<string>('OBJECT_STORAGE_REGION')?.trim() || 'us-east-1',
      endpoint: this.config.get<string>('OBJECT_STORAGE_ENDPOINT')?.trim() || undefined,
      accessKeyId,
      secretAccessKey,
      forcePathStyle: String(this.config.get<string>('OBJECT_STORAGE_FORCE_PATH_STYLE') ?? 'false').toLowerCase() === 'true',
      ttlSeconds: Number.isFinite(ttlRaw) ? Math.min(Math.max(Math.trunc(ttlRaw), 60), 3600) : 300,
      maxBytes: Number.isFinite(maxRaw) ? Math.min(Math.max(Math.trunc(maxRaw), 1_048_576), 104_857_600) : 26_214_400,
    };
    return this.cached;
  }

  private requestParts(key: string): RequestParts {
    const settings = this.settings();
    const encodedKey = encodeKey(key);
    const endpoint = settings.endpoint
      ? new URL(settings.endpoint)
      : new URL(`https://s3.${settings.region}.amazonaws.com`);

    if (settings.forcePathStyle) {
      const basePath = endpoint.pathname.replace(/\/$/, '');
      endpoint.pathname = `${basePath}/${awsEncode(settings.bucket)}/${encodedKey}`;
    } else {
      endpoint.hostname = `${settings.bucket}.${endpoint.hostname}`;
      const basePath = endpoint.pathname.replace(/\/$/, '');
      endpoint.pathname = `${basePath}/${encodedKey}`;
    }

    return {
      url: endpoint,
      canonicalUri: endpoint.pathname,
      host: endpoint.host,
    };
  }

  private signingKey(date: Date) {
    const settings = this.settings();
    const dateKey = hmac(`AWS4${settings.secretAccessKey}`, dateStamp(date));
    const regionKey = hmac(dateKey, settings.region);
    const serviceKey = hmac(regionKey, SERVICE);
    return hmac(serviceKey, 'aws4_request');
  }

  private credentialScope(date: Date) {
    const settings = this.settings();
    return `${dateStamp(date)}/${settings.region}/${SERVICE}/aws4_request`;
  }

  private canonicalQuery(params: URLSearchParams) {
    return [...params.entries()]
      .map(([key, value]) => [awsEncode(key), awsEncode(value)] as const)
      .sort(([leftKey, leftValue], [rightKey, rightValue]) => {
        const keyOrder = compareLexical(leftKey, rightKey);
        return keyOrder === 0 ? compareLexical(leftValue, rightValue) : keyOrder;
      })
      .map(([key, value]) => `${key}=${value}`)
      .join('&');
  }

  private presign(method: 'GET' | 'PUT', key: string, extraQuery: Record<string, string> = {}, contentType?: string) {
    const settings = this.settings();
    const now = new Date();
    const request = this.requestParts(key);
    const scope = this.credentialScope(now);
    const timestamp = amzDate(now);
    const signedHeaders = contentType ? 'content-type;host' : 'host';

    const params = new URLSearchParams(extraQuery);
    params.set('X-Amz-Algorithm', ALGORITHM);
    params.set('X-Amz-Credential', `${settings.accessKeyId}/${scope}`);
    params.set('X-Amz-Date', timestamp);
    params.set('X-Amz-Expires', String(settings.ttlSeconds));
    params.set('X-Amz-SignedHeaders', signedHeaders);

    const canonicalHeaders = contentType
      ? `content-type:${contentType.trim()}\nhost:${request.host}\n`
      : `host:${request.host}\n`;
    const canonicalRequest = [
      method,
      request.canonicalUri,
      this.canonicalQuery(params),
      canonicalHeaders,
      signedHeaders,
      UNSIGNED_PAYLOAD,
    ].join('\n');
    const stringToSign = [ALGORITHM, timestamp, scope, sha256(canonicalRequest)].join('\n');
    const signature = createHmac('sha256', this.signingKey(now)).update(stringToSign, 'utf8').digest('hex');
    params.set('X-Amz-Signature', signature);
    request.url.search = this.canonicalQuery(params);

    return {
      url: request.url.toString(),
      expiresAt: new Date(now.getTime() + settings.ttlSeconds * 1000),
    };
  }

  private async signedRequest(method: 'HEAD' | 'DELETE', key: string) {
    const settings = this.settings();
    const now = new Date();
    const request = this.requestParts(key);
    const timestamp = amzDate(now);
    const scope = this.credentialScope(now);
    const payloadHash = sha256('');
    const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
    const canonicalHeaders = `host:${request.host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${timestamp}\n`;
    const canonicalRequest = [
      method,
      request.canonicalUri,
      '',
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');
    const stringToSign = [ALGORITHM, timestamp, scope, sha256(canonicalRequest)].join('\n');
    const signature = createHmac('sha256', this.signingKey(now)).update(stringToSign, 'utf8').digest('hex');
    const authorization = `${ALGORITHM} Credential=${settings.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const response = await fetch(request.url, {
      method,
      headers: {
        authorization,
        'x-amz-content-sha256': payloadHash,
        'x-amz-date': timestamp,
      },
    });
    if (!response.ok) {
      throw new ServiceUnavailableException(`Private object storage request failed (${response.status}).`);
    }
    return response;
  }

  maxBytes() {
    return this.settings().maxBytes;
  }

  async presignPut(key: string, contentType: string) {
    const normalizedContentType = contentType.trim().toLowerCase();
    const signed = this.presign('PUT', key, {}, normalizedContentType);
    return { ...signed, requiredHeaders: { 'content-type': normalizedContentType } };
  }

  async presignGet(key: string, downloadName?: string | null) {
    return this.presign(
      'GET',
      key,
      downloadName
        ? { 'response-content-disposition': `attachment; filename*=UTF-8''${downloadName}` }
        : {},
    );
  }

  async head(key: string) {
    const response = await this.signedRequest('HEAD', key);
    const length = response.headers.get('content-length');
    const lastModified = response.headers.get('last-modified');
    return {
      byteSize: length == null ? null : Number(length),
      mimeType: response.headers.get('content-type'),
      etag: response.headers.get('etag')?.replace(/^"|"$/g, '') ?? null,
      lastModified: lastModified ? new Date(lastModified) : null,
    };
  }

  async remove(key: string) {
    await this.signedRequest('DELETE', key);
  }
}
