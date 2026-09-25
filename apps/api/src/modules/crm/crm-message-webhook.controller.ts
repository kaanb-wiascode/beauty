import { Controller, Get, NotFoundException, Param, Post, Query, Req, UnauthorizedException } from '@nestjs/common';
import { z } from 'zod';
import { CrmMessageProviderRegistryService } from './crm-message-provider-registry.service';
import { CrmMessageWebhookService } from './crm-message-webhook.service';

const providerKeySchema = z.string().trim().min(1).max(100).regex(/^[a-zA-Z0-9._-]+$/);

@Controller('crm/messages/webhooks')
export class CrmMessageWebhookController {
  constructor(
    private readonly webhooks: CrmMessageWebhookService,
    private readonly providers: CrmMessageProviderRegistryService,
  ) {}

  @Get(':providerKey')
  async verify(@Param('providerKey') rawProviderKey: string, @Query() query: Record<string, unknown>) {
    const provider = this.providers.resolveByKey(providerKeySchema.parse(rawProviderKey));
    if (!provider) throw new NotFoundException('Message provider not found.');
    if (!provider.verifyChallenge) throw new NotFoundException('Provider challenge verification is unavailable.');
    const challenge = await provider.verifyChallenge(query);
    if (challenge === null) throw new UnauthorizedException('Invalid provider verification token.');
    return challenge;
  }

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
