import { Body, Controller, Post } from '@nestjs/common';
import { MarketingLeadWebhookService } from './marketing-lead-webhook.service';

@Controller('marketing-webhooks')
export class MarketingLeadWebhookController {
  constructor(
    private readonly leadWebhook: MarketingLeadWebhookService,
  ) {}

  @Post('google-ads')
  googleAds(@Body() body: unknown) {
    return this.leadWebhook.ingestGoogle(
      body && typeof body === 'object' ? body as Record<string, unknown> : {},
    );
  }
}
