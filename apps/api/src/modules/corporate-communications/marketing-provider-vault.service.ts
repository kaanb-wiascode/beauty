import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

@Injectable()
export class MarketingProviderVaultService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly tenantContext: TenantContext,
  ) {}

  private activeVersion() {
    return this.config.get<string>('MARKETING_INTEGRATION_MASTER_KEY_VERSION', 'v1');
  }

  private previousKeys(): Record<string, string> {
    const raw = this.config.get<string>('MARKETING_INTEGRATION_PREVIOUS_MASTER_KEYS');
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      return Object.fromEntries(
        Object.entries(parsed).filter(([, value]) => typeof value === 'string' && value.length >= 32),
      ) as Record<string, string>;
    } catch {
      throw new BadRequestException('Önceki pazarlama entegrasyonu şifreleme anahtarları geçerli bir JSON nesnesi olmalıdır.');
    }
  }

  private keyMaterial(version: string) {
    if (version === this.activeVersion()) {
      const value = this.config.get<string>('MARKETING_INTEGRATION_MASTER_KEY');
      if (!value || value.length < 32) {
        throw new BadRequestException('Pazarlama entegrasyonları için en az 32 karakterlik bir şifreleme anahtarı tanımlanmalıdır.');
      }
      return value;
    }
    const previous = this.previousKeys()[version];
    if (!previous) throw new BadRequestException('İstenen pazarlama entegrasyonu şifreleme anahtarı kullanılamıyor.');
    return previous;
  }

  assertReady() {
    this.keyMaterial(this.activeVersion());
  }

  private key(version: string) {
    return createHash('sha256').update(this.keyMaterial(version)).digest();
  }

  private encrypt(payload: Record<string, string>, version = this.activeVersion()) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(version), iv);
    const data = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
    return Buffer.from(JSON.stringify({
      alg: 'A256GCM',
      keyVersion: version,
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      data: data.toString('base64'),
    }), 'utf8').toString('base64');
  }

  private decrypt(payload: string, databaseVersion: string): Record<string, string> {
    const envelope = JSON.parse(Buffer.from(payload, 'base64').toString('utf8')) as {
      keyVersion?: string;
      iv: string;
      tag: string;
      data: string;
    };
    const version = envelope.keyVersion ?? databaseVersion;
    const decipher = createDecipheriv('aes-256-gcm', this.key(version), Buffer.from(envelope.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
    const value = Buffer.concat([
      decipher.update(Buffer.from(envelope.data, 'base64')),
      decipher.final(),
    ]);
    return JSON.parse(value.toString('utf8')) as Record<string, string>;
  }

  async store(connectionId: string, secrets: Record<string, string>) {
    this.assertReady();
    const { tenantId, companyId } = this.tenantContext.getContext();
    const version = this.activeVersion();
    const encrypted = this.encrypt(secrets, version);
    await this.prisma.$transaction(async (tx) => {
      const connections = await tx.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT id FROM corporate_marketing_provider_connections
          WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text
          LIMIT 1`,
        connectionId,
        tenantId,
        companyId,
      );
      if (!connections[0]) {
        throw new BadRequestException('Entegrasyon bağlantısı aktif şirket kapsamında bulunamadı.');
      }

      await tx.$executeRawUnsafe(
        `INSERT INTO corporate_marketing_provider_secrets(
           connection_id,tenant_id,company_id,encrypted_payload,key_version,updated_at
         ) VALUES($1::text,$2::text,$3::text,$4,$5,NOW())
         ON CONFLICT(connection_id) DO UPDATE SET
           tenant_id=EXCLUDED.tenant_id,
           company_id=EXCLUDED.company_id,
           encrypted_payload=EXCLUDED.encrypted_payload,
           key_version=EXCLUDED.key_version,
           updated_at=NOW()`,
        connectionId,
        tenantId,
        companyId,
        encrypted,
        version,
      );
      await tx.$executeRawUnsafe(
        `UPDATE corporate_marketing_provider_connections
            SET credential_reference=$4,status='AUTHORIZED',last_error=NULL,updated_at=NOW()
          WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text`,
        connectionId,
        tenantId,
        companyId,
        `vault:${connectionId}`,
      );
    });
  }

  async loadScoped(connectionId: string, tenantId: string, companyId: string) {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ encryptedPayload: string; keyVersion: string }>>(
      `SELECT encrypted_payload AS "encryptedPayload",key_version AS "keyVersion"
         FROM corporate_marketing_provider_secrets
        WHERE connection_id=$1::text AND tenant_id=$2::text AND company_id=$3::text
        LIMIT 1`,
      connectionId,
      tenantId,
      companyId,
    );
    return rows[0] ? this.decrypt(rows[0].encryptedPayload, rows[0].keyVersion) : null;
  }

  async load(connectionId: string) {
    const { tenantId, companyId } = this.tenantContext.getContext();
    return this.loadScoped(connectionId, tenantId, companyId);
  }

  async merge(connectionId: string, patch: Record<string, string>) {
    this.assertReady();
    const { tenantId, companyId } = this.tenantContext.getContext();
    const current = (await this.loadScoped(connectionId, tenantId, companyId)) ?? {};
    const version = this.activeVersion();
    const encrypted = this.encrypt({ ...current, ...patch }, version);

    const updated = await this.prisma.$executeRawUnsafe(
      `UPDATE corporate_marketing_provider_secrets
          SET encrypted_payload=$4,key_version=$5,updated_at=NOW()
        WHERE connection_id=$1::text AND tenant_id=$2::text AND company_id=$3::text`,
      connectionId,
      tenantId,
      companyId,
      encrypted,
      version,
    );
    if (!updated) {
      throw new BadRequestException(
        'Entegrasyon güvenli erişim bilgileri bulunamadı. Önce hesabı yetkilendirin.',
      );
    }
  }

  async clear(connectionId: string) {
    const { tenantId, companyId } = this.tenantContext.getContext();
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `DELETE FROM corporate_marketing_provider_secrets
          WHERE connection_id=$1::text AND tenant_id=$2::text AND company_id=$3::text`,
        connectionId,
        tenantId,
        companyId,
      );
      await tx.$executeRawUnsafe(
        `UPDATE corporate_marketing_provider_connections
            SET credential_reference=NULL,status='DISCONNECTED',last_sync_at=NULL,last_error=NULL,updated_at=NOW()
          WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text`,
        connectionId,
        tenantId,
        companyId,
      );
    });
  }
}
