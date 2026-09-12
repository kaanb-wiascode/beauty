import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

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

@Injectable()
export class ObjectStorageService {
  private client?: S3Client;
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

  private s3() {
    if (this.client) return this.client;
    const settings = this.settings();
    this.client = new S3Client({
      region: settings.region,
      endpoint: settings.endpoint,
      forcePathStyle: settings.forcePathStyle,
      credentials: {
        accessKeyId: settings.accessKeyId,
        secretAccessKey: settings.secretAccessKey,
      },
    });
    return this.client;
  }

  maxBytes() {
    return this.settings().maxBytes;
  }

  async presignPut(key: string, contentType: string) {
    const settings = this.settings();
    const expiresAt = new Date(Date.now() + settings.ttlSeconds * 1000);
    const url = await getSignedUrl(
      this.s3(),
      new PutObjectCommand({
        Bucket: settings.bucket,
        Key: key,
        ContentType: contentType,
      }),
      { expiresIn: settings.ttlSeconds },
    );
    return { url, expiresAt, requiredHeaders: { 'content-type': contentType } };
  }

  async presignGet(key: string, downloadName?: string | null) {
    const settings = this.settings();
    const expiresAt = new Date(Date.now() + settings.ttlSeconds * 1000);
    const url = await getSignedUrl(
      this.s3(),
      new GetObjectCommand({
        Bucket: settings.bucket,
        Key: key,
        ResponseContentDisposition: downloadName
          ? `attachment; filename*=UTF-8''${encodeURIComponent(downloadName)}`
          : undefined,
      }),
      { expiresIn: settings.ttlSeconds },
    );
    return { url, expiresAt };
  }

  async head(key: string) {
    const settings = this.settings();
    const result = await this.s3().send(
      new HeadObjectCommand({ Bucket: settings.bucket, Key: key }),
    );
    return {
      byteSize: result.ContentLength == null ? null : Number(result.ContentLength),
      mimeType: result.ContentType ?? null,
      etag: result.ETag?.replace(/^"|"$/g, '') ?? null,
      lastModified: result.LastModified ?? null,
    };
  }

  async remove(key: string) {
    const settings = this.settings();
    await this.s3().send(new DeleteObjectCommand({ Bucket: settings.bucket, Key: key }));
  }
}
