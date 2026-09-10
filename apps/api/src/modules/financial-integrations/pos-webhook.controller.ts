import { Body, Controller, Headers, Param, Post } from '@nestjs/common';
import { PosWebhookService } from './pos-webhook.service';

@Controller('financial-integrations/webhooks')
export class PosWebhookController {
  constructor(private readonly webhooks: PosWebhookService) {}

  @Post(':integrationId/:provider')
  async ingest(
    @Param('integrationId') integrationId: string,
    @Param('provider') provider: string,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() payload: unknown,
  ) {
    const result = await this.webhooks.ingest(integrationId, provider, headers, payload);
    return provider.trim().toUpperCase() === 'PAYTR' ? 'OK' : result;
  }
}
