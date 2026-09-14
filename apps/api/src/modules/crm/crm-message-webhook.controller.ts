import { Controller, Param, Post, Req } from '@nestjs/common';
import { z } from 'zod';
import { CrmMessageWebhookService } from './crm-message-webhook.service';

const providerKeySchema = z.string().trim().min(1).max(100).regex(/^[a-zA-Z0-9._-]+$/);

@Controller('crm/messages/webhooks')
export class CrmMessageWebhookController {
  constructor(private readonly webhooks: CrmMessageWebhookService) {}

  @Post(':providerKey')
  handle(
    @Param('providerKey') rawProviderKey: string,
    @Req() request: {
      headers: Record<string, string | string[] | undefined>;
      rawBody?: Buffer;
      body: unknown;
    },
  ) {
    return this.webhooks.handle(providerKeySchema.parse(rawProviderKey), {
      headers: request.headers,
      rawBody: request.rawBody,
      body: request.body,
    });
  }
}
