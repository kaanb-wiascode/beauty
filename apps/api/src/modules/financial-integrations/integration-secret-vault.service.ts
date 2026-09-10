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

  private key() {
    const material = this.config.get<string>('FINANCIAL_INTEGRATION_MASTER_KEY');
    if (!material || material.length < 32) {
      throw new BadRequestException(
        'FINANCIAL_INTEGRATION_MASTER_KEY must be configured with at least 32 characters before provider credentials can be stored.',
      );
    }
    return createHash('sha256').update(material).digest();
  }

  private encrypt(value: unknown) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(value), 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return Buffer.from(JSON.stringify({
      alg: 'A256GCM',
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      data: encrypted.toString('base64'),
    }), 'utf8').toString('base64');
  }

  private decrypt<T>(payload: string): T {
    const envelope = JSON.parse(Buffer.from(payload, 'base64').toString('utf8')) as {
      iv: string;
      tag: string;
      data: string;
    };
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.key(),
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
    await client.$executeRawUnsafe(
      `INSERT INTO finance_integration_secrets(integration_id,encrypted_payload,key_version,updated_at)
       VALUES($1::text,$2,'v1',NOW())
       ON CONFLICT(integration_id) DO UPDATE
       SET encrypted_payload=EXCLUDED.encrypted_payload,key_version='v1',updated_at=NOW()`,
      integrationId,
      encryptedPayload,
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
    const rows = await this.prisma.$queryRawUnsafe<Array<{ encryptedPayload: string }>>(
      `SELECT encrypted_payload AS "encryptedPayload"
       FROM finance_integration_secrets WHERE integration_id=$1::text LIMIT 1`,
      integrationId,
    );
    if (!rows.length) return null;
    const value = this.decrypt<{ opaque?: Record<string, string> }>(rows[0].encryptedPayload);
    return value.opaque ?? null;
  }

  async load(integrationId: string): Promise<ProviderTokenSet | null> {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ encryptedPayload: string }>>(
      `SELECT encrypted_payload AS "encryptedPayload"
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
    }>(rows[0].encryptedPayload);
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

  async clear(integrationId: string) {
    await this.prisma.$executeRawUnsafe(
      `DELETE FROM finance_integration_secrets WHERE integration_id=$1::text`,
      integrationId,
    );
  }
}
