import { Body, Controller, Headers, Param, Post } from '@nestjs/common';
import { PosWebhookService } from './pos-webhook.service';

@Controller('financial-integrations/webhooks')
export class PosWebhookController {
  constructor(private readonly webhooks: PosWebhookService) {}

  @Post(':integrationId/:provider')
  ingest(
    @Param('integrationId') integrationId: string,
    @Param('provider') provider: string,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() payload: unknown,
  ) {
    return this.webhooks.ingest(integrationId, provider, headers, payload);
  }
}
