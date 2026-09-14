import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@beauty-erp/database';

@Injectable()
export class CrmMessageProviderVaultService {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}

  private activeVersion() {
    return this.config.get<string>('CRM_COMMUNICATION_MASTER_KEY_VERSION', 'v1');
  }

  private previousKeys(): Record<string, string> {
    const raw = this.config.get<string>('CRM_COMMUNICATION_PREVIOUS_MASTER_KEYS');
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      return Object.fromEntries(Object.entries(parsed).filter(([, value]) => typeof value === 'string' && value.length >= 32)) as Record<string, string>;
    } catch {
      throw new BadRequestException('CRM_COMMUNICATION_PREVIOUS_MASTER_KEYS must be a JSON object.');
    }
  }

  private keyMaterial(version: string) {
    if (version === this.activeVersion()) {
      const value = this.config.get<string>('CRM_COMMUNICATION_MASTER_KEY');
      if (!value || value.length < 32) {
        throw new BadRequestException('CRM_COMMUNICATION_MASTER_KEY must contain at least 32 characters.');
      }
      return value;
    }
    const previous = this.previousKeys()[version];
    if (!previous) throw new BadRequestException(`CRM communication encryption key ${version} is unavailable.`);
    return previous;
  }

  private key(version: string) {
    return createHash('sha256').update(this.keyMaterial(version)).digest();
  }

  private encrypt(payload: Record<string, string>, version = this.activeVersion()) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(version), iv);
    const data = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
    return Buffer.from(JSON.stringify({
      alg: 'A256GCM', keyVersion: version, iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64'),
    }), 'utf8').toString('base64');
  }

  private decrypt(payload: string, databaseVersion: string): Record<string, string> {
    const envelope = JSON.parse(Buffer.from(payload, 'base64').toString('utf8')) as { keyVersion?: string; iv: string; tag: string; data: string };
    const version = envelope.keyVersion ?? databaseVersion;
    const decipher = createDecipheriv('aes-256-gcm', this.key(version), Buffer.from(envelope.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
    const value = Buffer.concat([decipher.update(Buffer.from(envelope.data, 'base64')), decipher.final()]);
    return JSON.parse(value.toString('utf8')) as Record<string, string>;
  }

  async store(connectionId: string, secrets: Record<string, string>) {
    const version = this.activeVersion();
    const encrypted = this.encrypt(secrets, version);
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO crm_message_provider_secrets(connection_id,encrypted_payload,key_version,updated_at)
       VALUES($1::uuid,$2,$3,NOW())
       ON CONFLICT(connection_id) DO UPDATE SET encrypted_payload=EXCLUDED.encrypted_payload,key_version=EXCLUDED.key_version,updated_at=NOW()`,
      connectionId, encrypted, version,
    );
  }

  async load(connectionId: string) {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ encryptedPayload: string; keyVersion: string }>>(
      `SELECT encrypted_payload AS "encryptedPayload",key_version AS "keyVersion" FROM crm_message_provider_secrets WHERE connection_id=$1::uuid LIMIT 1`,
      connectionId,
    );
    return rows[0] ? this.decrypt(rows[0].encryptedPayload, rows[0].keyVersion) : null;
  }

  async clear(connectionId: string) {
    await this.prisma.$executeRawUnsafe(`DELETE FROM crm_message_provider_secrets WHERE connection_id=$1::uuid`, connectionId);
  }
}
