import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
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

  @Get('meta')
  verifyMeta(
    @Query('hub.mode') mode?: string,
    @Query('hub.verify_token') verifyToken?: string,
    @Query('hub.challenge') challenge?: string,
  ) {
    return this.leadWebhook.verifyMetaChallenge({
      mode,
      verifyToken,
      challenge,
    });
  }

  @Post('meta')
  meta(
    @Req() request: RawBodyRequest<Request>,
    @Headers('x-hub-signature-256') signature: string | undefined,
    @Body() body: unknown,
  ) {
    return this.leadWebhook.ingestMeta(
      request.rawBody,
      signature,
      body && typeof body === 'object' ? body as Record<string, unknown> : {},
    );
  }
}
