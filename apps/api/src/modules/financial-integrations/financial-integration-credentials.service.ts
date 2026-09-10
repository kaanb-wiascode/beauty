import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { FinancialIntegrationsService } from './financial-integrations.service';
import { IntegrationSecretVaultService } from './integration-secret-vault.service';

@Injectable()
export class FinancialIntegrationCredentialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly integrations: FinancialIntegrationsService,
    private readonly vault: IntegrationSecretVaultService,
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

    await this.vault.storeOpaque(integrationId, Object.fromEntries(entries));
    await this.prisma.$executeRawUnsafe(
      `UPDATE finance_integrations
       SET status='PENDING',last_error=NULL,metadata=metadata || jsonb_build_object('credentialFields',$2::jsonb),updated_at=NOW()
       WHERE id=$1::text`,
      integrationId,
      JSON.stringify(entries.map(([key]) => key)),
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
    return {
      integrationId,
      authType: integration.authType,
      configured: Boolean(credentials && Object.keys(credentials).length),
      fields: credentials ? Object.keys(credentials) : [],
    };
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
       WHERE id=$1::text`,
      integrationId,
    );
    return { integrationId, configured: false, fields: [] };
  }
}
