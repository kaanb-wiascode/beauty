import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { FinancialIntegrationConnectionService } from './financial-integration-connection.service';
import { PublicFinancialRateLimit, PublicFinancialRateLimitGuard } from './public-financial-rate-limit.guard';
import { FinancialIntegrationTelemetryService } from './financial-integration-telemetry.service';

const callbackSchema = z.object({
  state: z.string().min(10),
  code: z.string().min(1),
});

@Controller('financial-integrations')
@UseGuards(PublicFinancialRateLimitGuard)
export class FinancialIntegrationCallbackController {
  constructor(
    private readonly connection: FinancialIntegrationConnectionService,
    private readonly telemetry: FinancialIntegrationTelemetryService,
  ) {}

  @Get('callback')
  @PublicFinancialRateLimit({ bucket: 'oauth-callback', limit: 60, windowSeconds: 300 })
  async callback(@Query() query: unknown) {
    const parsed = callbackSchema.parse(query);
    try {
      const result = await this.connection.callback(parsed.state, parsed.code);
      this.telemetry.info('oauth_callback_completed');
      return result;
    } catch (error) {
      this.telemetry.error('oauth_callback_failed', error);
      throw error;
    }
  }
}
