import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

@Injectable()
export class CrmMessageProviderConnectionsService {
  constructor(private readonly prisma: PrismaService, private readonly tenantContext: TenantContext) {}

  private scope() {
    const context = this.tenantContext.getContext();
    if (!context.branchId) throw new BadRequestException('Active branch is required.');
    return { tenantId: context.tenantId, companyId: context.companyId, branchId: context.branchId };
  }

  list() {
    const scope = this.scope();
    return this.prisma.$queryRawUnsafe(
      `SELECT c.id,c.provider_key AS "providerKey",c.channel,c.enabled,c.public_config AS "publicConfig",c.version,
              EXISTS(SELECT 1 FROM crm_message_provider_secrets s WHERE s.connection_id=c.id) AS "credentialsConfigured",
              c.updated_at AS "updatedAt"
       FROM crm_message_provider_connections c
       WHERE c.tenant_id=$1::text AND c.company_id=$2::text AND c.branch_id=$3::text ORDER BY c.provider_key,c.channel`,
      scope.tenantId, scope.companyId, scope.branchId,
    );
  }

  async getScoped(providerKey: string, channel: string, scope: { tenantId: string; companyId: string; branchId: string }) {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string; enabled: boolean; publicConfig: Record<string, unknown> }>>(
      `SELECT id,enabled,public_config AS "publicConfig" FROM crm_message_provider_connections
       WHERE tenant_id=$1::text AND company_id=$2::text AND branch_id=$3::text AND provider_key=$4 AND channel=$5 LIMIT 1`,
      scope.tenantId, scope.companyId, scope.branchId, providerKey, channel,
    );
    return rows[0] ?? null;
  }

  async findMetaByPhoneNumberId(phoneNumberId: string) {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string; tenantId: string; companyId: string; branchId: string; publicConfig: Record<string, unknown> }>>(
      `SELECT id,tenant_id AS "tenantId",company_id AS "companyId",branch_id AS "branchId",public_config AS "publicConfig"
       FROM crm_message_provider_connections
       WHERE provider_key='meta-whatsapp' AND channel='WHATSAPP' AND enabled=TRUE AND public_config->>'phoneNumberId'=$1 LIMIT 2`,
      phoneNumberId,
    );
    if (rows.length > 1) throw new ConflictException('Meta phone number id is mapped to multiple CRM branches.');
    return rows[0] ?? null;
  }

  async saveMetaPublicConfig(input: { version?: number; enabled: boolean; phoneNumberId: string; graphApiVersion: string }, actorUserId: string) {
    const scope = this.scope();
    const config = { phoneNumberId: input.phoneNumberId.trim(), graphApiVersion: input.graphApiVersion.trim() };
    if (!/^v\d+\.\d+$/.test(config.graphApiVersion)) throw new BadRequestException('Graph API version is invalid.');
    const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string; version: number }>>(
      `INSERT INTO crm_message_provider_connections(tenant_id,company_id,branch_id,provider_key,channel,enabled,public_config,created_by_user_id,updated_by_user_id)
       VALUES($1::text,$2::text,$3::text,'meta-whatsapp','WHATSAPP',$4,$5::jsonb,$6::text,$6::text)
       ON CONFLICT(tenant_id,company_id,branch_id,provider_key,channel) DO UPDATE SET enabled=EXCLUDED.enabled,public_config=EXCLUDED.public_config,updated_by_user_id=EXCLUDED.updated_by_user_id,version=crm_message_provider_connections.version+1,updated_at=NOW()
       WHERE $7::int IS NULL OR crm_message_provider_connections.version=$7::int RETURNING id,version`,
      scope.tenantId, scope.companyId, scope.branchId, input.enabled, JSON.stringify(config), actorUserId, input.version ?? null,
    );
    if (!rows[0]) throw new ConflictException('Provider connection version changed.');
    return { id: rows[0].id, version: rows[0].version, ...config, enabled: input.enabled };
  }

  async saveTwilioSmsPublicConfig(input: { version?: number; enabled: boolean; fromNumber: string }, actorUserId: string) {
    const scope = this.scope();
    const fromNumber = input.fromNumber.trim().replace(/[\s()-]/g, '');
    if (!/^\+[1-9]\d{7,14}$/.test(fromNumber)) {
      throw new BadRequestException('Twilio sender number must use E.164 format.');
    }
    const config = { fromNumber };
    const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string; version: number }>>(
      `INSERT INTO crm_message_provider_connections(tenant_id,company_id,branch_id,provider_key,channel,enabled,public_config,created_by_user_id,updated_by_user_id)
       VALUES($1::text,$2::text,$3::text,'twilio-sms','SMS',$4,$5::jsonb,$6::text,$6::text)
       ON CONFLICT(tenant_id,company_id,branch_id,provider_key,channel) DO UPDATE SET enabled=EXCLUDED.enabled,public_config=EXCLUDED.public_config,updated_by_user_id=EXCLUDED.updated_by_user_id,version=crm_message_provider_connections.version+1,updated_at=NOW()
       WHERE $7::int IS NULL OR crm_message_provider_connections.version=$7::int RETURNING id,version`,
      scope.tenantId, scope.companyId, scope.branchId, input.enabled, JSON.stringify(config), actorUserId, input.version ?? null,
    );
    if (!rows[0]) throw new ConflictException('Provider connection version changed.');
    return { id: rows[0].id, version: rows[0].version, fromNumber, enabled: input.enabled };
  }

  async saveResendEmailPublicConfig(
    input: { version?: number; enabled: boolean; fromEmail: string; fromName?: string },
    actorUserId: string,
  ) {
    const scope = this.scope();
    const fromEmail = input.fromEmail.trim().toLowerCase();
    const fromName = input.fromName?.trim() || '';
    if (!/^\S+@\S+\.\S+$/.test(fromEmail)) {
      throw new BadRequestException('Resend sender e-mail address is invalid.');
    }
    const config = { fromEmail, fromName };
    const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string; version: number }>>(
      `INSERT INTO crm_message_provider_connections(tenant_id,company_id,branch_id,provider_key,channel,enabled,public_config,created_by_user_id,updated_by_user_id)
       VALUES($1::text,$2::text,$3::text,'resend-email','EMAIL',$4,$5::jsonb,$6::text,$6::text)
       ON CONFLICT(tenant_id,company_id,branch_id,provider_key,channel) DO UPDATE SET enabled=EXCLUDED.enabled,public_config=EXCLUDED.public_config,updated_by_user_id=EXCLUDED.updated_by_user_id,version=crm_message_provider_connections.version+1,updated_at=NOW()
       WHERE $7::int IS NULL OR crm_message_provider_connections.version=$7::int RETURNING id,version`,
      scope.tenantId, scope.companyId, scope.branchId, input.enabled, JSON.stringify(config), actorUserId, input.version ?? null,
    );
    if (!rows[0]) throw new ConflictException('Provider connection version changed.');
    return { id: rows[0].id, version: rows[0].version, fromEmail, fromName, enabled: input.enabled };
  }
}
