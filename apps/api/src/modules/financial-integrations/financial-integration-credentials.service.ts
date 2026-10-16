import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { FinancialIntegrationsService } from './financial-integrations.service';
import { IntegrationSecretVaultService } from './integration-secret-vault.service';
import { ProviderRegistryService } from './provider-registry.service';

@Injectable()
export class FinancialIntegrationCredentialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly integrations: FinancialIntegrationsService,
    private readonly vault: IntegrationSecretVaultService,
    private readonly providers: ProviderRegistryService,
  ) {}

  async configure(
    integrationId: string,
    credentials: Record<string, string>,
  ) {
    const integration = await this.integrations.get(integrationId);
    if (integration.authType !== 'API_KEY') {
      throw new BadRequestException('Credentials can only be configured for API_KEY integrations.');
    }

    const entries = Object.entries(credentials)
      .map(([key, value]) => [key.trim(), value.trim()] as const)
      .filter(([key, value]) => key && value);

    if (!entries.length) {
      throw new BadRequestException('At least one credential value is required.');
    }
    if (entries.length > 20) {
      throw new BadRequestException('A maximum of 20 credential fields is allowed.');
    }
    for (const [key, value] of entries) {
      if (!/^[A-Za-z0-9_.-]{1,80}$/.test(key)) {
        throw new BadRequestException(`Credential key ${key} is invalid.`);
      }
      if (value.length > 4000) {
        throw new BadRequestException(`Credential value ${key} is too long.`);
      }
    }

    if (this.providers.has(integration.kind, integration.provider)) {
      const adapter = this.providers.get(integration.kind, integration.provider);
      const allowed = new Set((adapter.credentialFields ?? []).map((field) => field.key));
      const required = (adapter.credentialFields ?? []).filter((field) => field.required).map((field) => field.key);
      if (allowed.size) {
        const unknown = entries.map(([key]) => key).filter((key) => !allowed.has(key));
        if (unknown.length) {
          throw new BadRequestException(`Unsupported credential field(s): ${unknown.join(', ')}.`);
        }
      }
      const supplied = new Set(entries.map(([key]) => key));
      const missing = required.filter((key) => !supplied.has(key));
      if (missing.length) {
        throw new BadRequestException(`Missing required credential field(s): ${missing.join(', ')}.`);
      }
    }

    await this.vault.storeOpaque(integrationId, Object.fromEntries(entries));
    await this.prisma.$executeRawUnsafe(
      `UPDATE finance_integrations
       SET status='PENDING',last_error=NULL,metadata=metadata || jsonb_build_object('credentialFields',$2::jsonb),updated_at=NOW()
       WHERE id=$1::text AND tenant_id=$3::text AND company_id=$4::text
         AND branch_id IS NOT DISTINCT FROM $5::text`,
      integrationId,
      JSON.stringify(entries.map(([key]) => key)),
      integration.tenantId,
      integration.companyId,
      integration.branchId,
    );

    return {
      integrationId,
      configured: true,
      fields: entries.map(([key]) => key),
      status: 'PENDING',
    };
  }

  async status(integrationId: string) {
    const integration = await this.integrations.get(integrationId);
    const credentials = await this.vault.loadOpaque(integrationId);
    const key = await this.vault.keyStatus(integrationId);
    const adapter = this.providers.has(integration.kind, integration.provider)
      ? this.providers.get(integration.kind, integration.provider)
      : null;
    return {
      integrationId,
      authType: integration.authType,
      configured: Boolean(credentials && Object.keys(credentials).length),
      fields: credentials ? Object.keys(credentials) : [],
      requiredFields: (adapter?.credentialFields ?? []).map((field) => ({
        key: field.key,
        label: field.label,
        secret: field.secret ?? true,
        required: field.required ?? false,
      })),
      runtimeReady: adapter?.runtimeReady ?? false,
      encryption: key,
    };
  }

  async rotate(integrationId: string) {
    await this.integrations.get(integrationId);
    return this.vault.rotate(integrationId);
  }

  async clear(integrationId: string) {
    const integration = await this.integrations.get(integrationId);
    if (integration.authType !== 'API_KEY') {
      throw new BadRequestException('Only API_KEY credentials can be cleared here.');
    }
    await this.vault.clear(integrationId);
    await this.prisma.$executeRawUnsafe(
      `UPDATE finance_integrations
       SET status='DISCONNECTED',last_error=NULL,updated_at=NOW()
       WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text
         AND branch_id IS NOT DISTINCT FROM $4::text`,
      integrationId,
      integration.tenantId,
      integration.companyId,
      integration.branchId,
    );
    return { integrationId, configured: false, fields: [] };
  }
}
