import {
  Body,
  Controller,
  Headers,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { PosWebhookService } from './pos-webhook.service';
import {
  PublicFinancialRateLimit,
  PublicFinancialRateLimitGuard,
} from './public-financial-rate-limit.guard';
import { FinancialIntegrationTelemetryService } from './financial-integration-telemetry.service';

const integrationIdSchema = z.string().uuid();
const providerSchema = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .regex(/^[A-Za-z0-9_-]+$/);

@Controller('financial-integrations/webhooks')
@UseGuards(PublicFinancialRateLimitGuard)
export class PosWebhookController {
  constructor(
    private readonly webhooks: PosWebhookService,
    private readonly telemetry: FinancialIntegrationTelemetryService,
  ) {}

  @Post(':integrationId/:provider')
  @PublicFinancialRateLimit({
    bucket: 'pos-webhook',
    limit: 600,
    windowSeconds: 60,
  })
  async ingest(
    @Param('integrationId') integrationId: string,
    @Param('provider') provider: string,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() payload: unknown,
  ) {
    const parsedIntegrationId = integrationIdSchema.parse(integrationId);
    const parsedProvider = providerSchema.parse(provider);
    const normalizedProvider = parsedProvider.toUpperCase();
    try {
      const result = await this.webhooks.ingest(
        parsedIntegrationId,
        parsedProvider,
        headers,
        payload,
      );
      this.telemetry.info('public_webhook_ingested', {
        integrationId: parsedIntegrationId,
        provider: normalizedProvider,
        requiresEnrichment: Boolean(
          (result as { requiresEnrichment?: boolean })?.requiresEnrichment,
        ),
      });
      return normalizedProvider === 'PAYTR' ? 'OK' : result;
    } catch (error) {
      this.telemetry.error('public_webhook_failed', error, {
        integrationId: parsedIntegrationId,
        provider: normalizedProvider,
      });
      throw error;
    }
  }
}
