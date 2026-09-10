import { createHash, randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { FinancialIntegrationsService } from './financial-integrations.service';
import { IntegrationSecretVaultService } from './integration-secret-vault.service';
import { ProviderRegistryService } from './provider-registry.service';

@Injectable()
export class FinancialIntegrationConnectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly integrations: FinancialIntegrationsService,
    private readonly providers: ProviderRegistryService,
    private readonly vault: IntegrationSecretVaultService,
  ) {}

  private hashState(state: string) {
    return createHash('sha256').update(state).digest('hex');
  }

  async begin(integrationId: string, callbackBaseUrl: string) {
    const integration = await this.integrations.get(integrationId);
    if (integration.authType !== 'OAUTH2') {
      return this.integrations.beginConnection(integrationId, callbackBaseUrl);
    }

    if (!this.providers.has(integration.kind, integration.provider)) {
      return {
        integrationId,
        provider: integration.provider,
        status: integration.status,
        providerConfigured: false,
        message: 'Provider adapter is not configured yet.',
      };
    }

    const state = randomUUID();
    const callbackUrl = `${callbackBaseUrl.replace(/\/$/, '')}/financial-integrations/callback`;
    const sessionId = randomUUID();
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO finance_integration_auth_sessions(id,integration_id,state_hash,callback_url,expires_at)
       VALUES($1::text,$2::text,$3,$4,NOW()+INTERVAL '10 minutes')`,
      sessionId,
      integrationId,
      this.hashState(state),
      callbackUrl,
    );

    const adapter = this.providers.get(integration.kind, integration.provider);
    if (!adapter.beginAuthorization) {
      throw new BadRequestException('Provider does not support OAuth authorization.');
    }
    const auth = await adapter.beginAuthorization({ integrationId, callbackUrl, state });
    return {
      integrationId,
      provider: integration.provider,
      providerConfigured: true,
      state,
      callbackUrl,
      authorizationUrl: auth.authorizationUrl,
    };
  }

  async callback(state: string, code: string) {
    if (!state || !code) throw new BadRequestException('OAuth state and code are required.');
    const stateHash = this.hashState(state);

    return this.prisma.$transaction(async (tx) => {
      const sessions = await tx.$queryRawUnsafe<any[]>(
        `SELECT s.id,s.integration_id AS "integrationId",s.callback_url AS "callbackUrl",
                i.kind,i.provider
         FROM finance_integration_auth_sessions s
         JOIN finance_integrations i ON i.id=s.integration_id
         WHERE s.state_hash=$1 AND s.consumed_at IS NULL AND s.expires_at>NOW()
         FOR UPDATE`,
        stateHash,
      );
      if (!sessions.length) throw new BadRequestException('OAuth state is invalid or expired.');
      const session = sessions[0];
      const adapter = this.providers.get(session.kind, session.provider);
      if (!adapter.exchangeAuthorizationCode) {
        throw new BadRequestException('Provider does not support OAuth code exchange.');
      }

      const tokens = await adapter.exchangeAuthorizationCode({
        code,
        callbackUrl: session.callbackUrl,
      });
      await this.vault.store(session.integrationId, tokens);
      await tx.$executeRawUnsafe(
        `UPDATE finance_integration_auth_sessions SET consumed_at=NOW() WHERE id=$1::text`,
        session.id,
      );
      await tx.$executeRawUnsafe(
        `UPDATE finance_integrations
         SET status='CONNECTED',external_connection_id=$2,consent_expires_at=$3,last_error=NULL,updated_at=NOW()
         WHERE id=$1::text`,
        session.integrationId,
        tokens.externalConnectionId ?? null,
        tokens.consentExpiresAt ?? null,
      );

      const integration = await tx.$queryRawUnsafe<any[]>(
        `SELECT id,kind,provider,display_name AS "displayName",status,branch_id AS "branchId",
                consent_expires_at AS "consentExpiresAt"
         FROM finance_integrations WHERE id=$1::text LIMIT 1`,
        session.integrationId,
      );
      if (!integration.length) throw new NotFoundException('Financial integration not found.');
      return integration[0];
    });
  }
}
