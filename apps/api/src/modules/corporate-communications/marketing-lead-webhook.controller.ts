import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { MarketingLeadWebhookService } from './marketing-lead-webhook.service';

@Controller('marketing-webhooks')
export class MarketingLeadWebhookController {
  constructor(
    private readonly leadWebhook: MarketingLeadWebhookService,
  ) {}

  @Post('google-ads/:connectionId')
  googleAds(
    @Param('connectionId', new ParseUUIDPipe()) connectionId: string,
    @Body() body: unknown,
  ) {
    return this.leadWebhook.ingestGoogle(
      connectionId,
      body && typeof body === 'object' ? body as Record<string, unknown> : {},
    );
  }
}
