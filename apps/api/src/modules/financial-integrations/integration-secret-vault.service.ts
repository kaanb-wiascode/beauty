import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, PrismaService } from '@beauty-erp/database';
import type { ProviderTokenSet } from './provider-adapter';

@Injectable()
export class IntegrationSecretVaultService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private activeKeyVersion() {
    return this.config.get<string>('FINANCIAL_INTEGRATION_MASTER_KEY_VERSION', 'v1');
  }

  private previousKeys(): Record<string, string> {
    const raw = this.config.get<string>('FINANCIAL_INTEGRATION_PREVIOUS_MASTER_KEYS');
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const entries = Object.entries(parsed).filter(([, value]) => typeof value === 'string' && value.length >= 32);
      return Object.fromEntries(entries) as Record<string, string>;
    } catch {
      throw new BadRequestException('FINANCIAL_INTEGRATION_PREVIOUS_MASTER_KEYS must be a JSON object of keyVersion -> key material.');
    }
  }

  private keyMaterial(version: string) {
    if (version === this.activeKeyVersion()) {
      const active = this.config.get<string>('FINANCIAL_INTEGRATION_MASTER_KEY');
      if (!active || active.length < 32) {
        throw new BadRequestException(
          'FINANCIAL_INTEGRATION_MASTER_KEY must be configured with at least 32 characters before provider credentials can be stored.',
        );
      }
      return active;
    }
    const previous = this.previousKeys()[version];
    if (!previous) {
      throw new BadRequestException(`Financial integration encryption key ${version} is not available.`);
    }
    return previous;
  }

  private key(version: string) {
    return createHash('sha256').update(this.keyMaterial(version)).digest();
  }

  private encrypt(value: unknown, version = this.activeKeyVersion()) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(version), iv);
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(value), 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return Buffer.from(JSON.stringify({
      alg: 'A256GCM',
      kekProvider: 'LOCAL_MASTER_KEY',
      keyVersion: version,
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      data: encrypted.toString('base64'),
    }), 'utf8').toString('base64');
  }

  private decrypt<T>(payload: string, databaseKeyVersion: string): T {
    const envelope = JSON.parse(Buffer.from(payload, 'base64').toString('utf8')) as {
      keyVersion?: string;
      iv: string;
      tag: string;
      data: string;
    };
    const keyVersion = envelope.keyVersion ?? databaseKeyVersion;
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.key(keyVersion),
      Buffer.from(envelope.iv, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(envelope.data, 'base64')),
      decipher.final(),
    ]);
    return JSON.parse(decrypted.toString('utf8')) as T;
  }

  private serialize(tokens: ProviderTokenSet) {
    return this.encrypt({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt?.toISOString(),
      externalConnectionId: tokens.externalConnectionId,
      consentExpiresAt: tokens.consentExpiresAt?.toISOString(),
      metadata: tokens.metadata ?? {},
    });
  }

  private async writeEncrypted(
    client: Prisma.TransactionClient | PrismaService,
    integrationId: string,
    encryptedPayload: string,
  ) {
    const keyVersion = this.activeKeyVersion();
    await client.$executeRawUnsafe(
      `INSERT INTO finance_integration_secrets(integration_id,encrypted_payload,key_version,updated_at)
       VALUES($1::text,$2,$3,NOW())
       ON CONFLICT(integration_id) DO UPDATE
       SET encrypted_payload=EXCLUDED.encrypted_payload,key_version=EXCLUDED.key_version,updated_at=NOW()`,
      integrationId,
      encryptedPayload,
      keyVersion,
    );
  }

  async store(integrationId: string, tokens: ProviderTokenSet) {
    return this.storeWith(this.prisma, integrationId, tokens);
  }

  async storeWith(
    client: Prisma.TransactionClient | PrismaService,
    integrationId: string,
    tokens: ProviderTokenSet,
  ) {
    await this.writeEncrypted(client, integrationId, this.serialize(tokens));
  }

  async storeOpaque(integrationId: string, payload: Record<string, string>) {
    await this.writeEncrypted(this.prisma, integrationId, this.encrypt({ opaque: payload }));
  }

  async loadOpaque(integrationId: string): Promise<Record<string, string> | null> {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ encryptedPayload: string; keyVersion: string }>>(
      `SELECT encrypted_payload AS "encryptedPayload",key_version AS "keyVersion"
       FROM finance_integration_secrets WHERE integration_id=$1::text LIMIT 1`,
      integrationId,
    );
    if (!rows.length) return null;
    const value = this.decrypt<{ opaque?: Record<string, string> }>(rows[0].encryptedPayload, rows[0].keyVersion);
    return value.opaque ?? null;
  }

  async load(integrationId: string): Promise<ProviderTokenSet | null> {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ encryptedPayload: string; keyVersion: string }>>(
      `SELECT encrypted_payload AS "encryptedPayload",key_version AS "keyVersion"
       FROM finance_integration_secrets WHERE integration_id=$1::text LIMIT 1`,
      integrationId,
    );
    if (!rows.length) return null;
    const value = this.decrypt<{
      accessToken?: string;
      refreshToken?: string;
      expiresAt?: string;
      externalConnectionId?: string;
      consentExpiresAt?: string;
      metadata?: Record<string, unknown>;
    }>(rows[0].encryptedPayload, rows[0].keyVersion);
    if (!value.accessToken) return null;
    return {
      accessToken: value.accessToken,
      refreshToken: value.refreshToken,
      expiresAt: value.expiresAt ? new Date(value.expiresAt) : undefined,
      externalConnectionId: value.externalConnectionId,
      consentExpiresAt: value.consentExpiresAt ? new Date(value.consentExpiresAt) : undefined,
      metadata: value.metadata,
    };
  }

  async rotate(integrationId: string) {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ encryptedPayload: string; keyVersion: string }>>(
      `SELECT encrypted_payload AS "encryptedPayload",key_version AS "keyVersion"
       FROM finance_integration_secrets WHERE integration_id=$1::text LIMIT 1`,
      integrationId,
    );
    if (!rows.length) return { integrationId, rotated: false, keyVersion: null };
    const value = this.decrypt<unknown>(rows[0].encryptedPayload, rows[0].keyVersion);
    const activeVersion = this.activeKeyVersion();
    await this.writeEncrypted(this.prisma, integrationId, this.encrypt(value, activeVersion));
    return { integrationId, rotated: true, previousKeyVersion: rows[0].keyVersion, keyVersion: activeVersion };
  }

  async keyStatus(integrationId: string) {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ keyVersion: string; updatedAt: Date }>>(
      `SELECT key_version AS "keyVersion",updated_at AS "updatedAt"
       FROM finance_integration_secrets WHERE integration_id=$1::text LIMIT 1`,
      integrationId,
    );
    if (!rows.length) return { keyVersion: null, activeKeyVersion: this.activeKeyVersion(), rotationRequired: false, updatedAt: null };
    return {
      keyVersion: rows[0].keyVersion,
      activeKeyVersion: this.activeKeyVersion(),
      rotationRequired: rows[0].keyVersion !== this.activeKeyVersion(),
      updatedAt: rows[0].updatedAt,
    };
  }

  async clear(integrationId: string) {
    await this.prisma.$executeRawUnsafe(
      `DELETE FROM finance_integration_secrets WHERE integration_id=$1::text`,
      integrationId,
    );
  }
}
