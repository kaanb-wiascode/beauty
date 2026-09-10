import { createHash, randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@beauty-erp/database';
import type { Env } from '../../config/env.schema';
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
    private readonly config: ConfigService<Env>,
  ) {}

  private hashState(state: string) {
    return createHash('sha256').update(state).digest('hex');
  }

  private trustedCallbackUrl() {
    const configured = this.config.get('PUBLIC_API_URL', { infer: true });
    if (configured) return `${configured.replace(/\/$/, '')}/financial-integrations/callback`;

    const environment = this.config.get('NODE_ENV', { infer: true }) ?? 'development';
    if (environment === 'production') {
      throw new ServiceUnavailableException('PUBLIC_API_URL must be configured before OAuth connections can be started.');
    }
    const port = this.config.get('PORT', { infer: true }) ?? 3000;
    return `http://localhost:${port}/financial-integrations/callback`;
  }

  async begin(integrationId: string) {
    const integration = await this.integrations.get(integrationId);
    if (!this.providers.has(integration.kind, integration.provider)) {
      return {
        integrationId,
        provider: integration.provider,
        status: integration.status,
        providerConfigured: false,
        message: 'Provider adapter is not configured yet.',
      };
    }

    const adapter = this.providers.get(integration.kind, integration.provider);
    if (integration.authType !== 'OAUTH2') {
      if (integration.authType === 'API_KEY' && adapter.authenticateCredentials) {
        const credentials = await this.vault.loadOpaque(integrationId);
        if (!credentials) {
          throw new BadRequestException('Provider credentials must be configured before the connection can be started.');
        }
        const tokens = await adapter.authenticateCredentials(credentials);
        if (!tokens.accessToken) {
          throw new BadRequestException('Provider returned an invalid authentication response.');
        }
        await this.prisma.$executeRawUnsafe(
          `UPDATE finance_integrations
           SET status='CONNECTED',external_connection_id=COALESCE($2,external_connection_id),
               consent_expires_at=COALESCE($3,consent_expires_at),last_error=NULL,
               metadata=metadata || jsonb_build_object('authenticationMode','CLIENT_CREDENTIALS'),updated_at=NOW()
           WHERE id=$1::text`,
          integrationId,
          tokens.externalConnectionId ?? null,
          tokens.consentExpiresAt ?? null,
        );
        return {
          ...(await this.integrations.get(integrationId)),
          providerConfigured: true,
          mode: integration.authType,
          authenticated: true,
        };
      }

      return {
        integrationId,
        provider: integration.provider,
        status: integration.status,
        providerConfigured: true,
        mode: integration.authType,
        message: 'Provider credentials must be submitted through the secure credential endpoint; secrets are never returned by this API.',
      };
    }

    const state = randomUUID();
    const callbackUrl = this.trustedCallbackUrl();
    const sessionId = randomUUID();
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO finance_integration_auth_sessions(id,integration_id,state_hash,callback_url,expires_at)
       VALUES($1::text,$2::text,$3,$4,NOW()+INTERVAL '10 minutes')`,
      sessionId,
      integrationId,
      this.hashState(state),
      callbackUrl,
    );

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
      await this.vault.storeWith(tx, session.integrationId, tokens);
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

  async disconnect(integrationId: string) {
    const integration = await this.integrations.get(integrationId);
    const tokens = await this.vault.load(integrationId);
    if (tokens && this.providers.has(integration.kind, integration.provider)) {
      const adapter = this.providers.get(integration.kind, integration.provider);
      if (adapter.revoke) {
        try {
          await adapter.revoke(tokens);
        } catch {
          // Local disconnect must still proceed even if the provider revoke endpoint is unavailable.
        }
      }
    }
    await this.vault.clear(integrationId);
    await this.prisma.$executeRawUnsafe(
      `UPDATE finance_integrations
       SET status='DISCONNECTED',external_connection_id=NULL,consent_expires_at=NULL,last_error=NULL,updated_at=NOW()
       WHERE id=$1::text`,
      integrationId,
    );
    return this.integrations.get(integrationId);
  }
}
