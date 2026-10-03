import { Body, Controller, Patch, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { CrmMessageProviderConnectionsService } from './crm-message-provider-connections.service';
import { CrmMessageProviderVaultService } from './crm-message-provider-vault.service';

const schema = z.object({
  version: z.coerce.number().int().min(1).optional(),
  enabled: z.boolean().default(true),
  fromNumber: z.string().trim().min(8).max(24),
  accountSid: z.string().trim().regex(/^AC[a-fA-F0-9]{32}$/),
  authToken: z.string().trim().min(20).max(200),
});

@Controller('crm/message-provider-connections/twilio-sms')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
export class TwilioSmsConnectionController {
  constructor(
    private readonly connections: CrmMessageProviderConnectionsService,
    private readonly vault: CrmMessageProviderVaultService,
  ) {}

  @Patch()
  @RequirePermission('crm', 'manage')
  async configure(@Body() body: unknown, @Req() request: { user?: { sub?: string } }) {
    const actorUserId = request.user?.sub;
    if (!actorUserId) throw new UnauthorizedException('Authenticated user id is missing.');
    const input = schema.parse(body);
    this.vault.assertReady();
    const saved = await this.connections.saveTwilioSmsPublicConfig(input, actorUserId);
    await this.vault.store(saved.id, { accountSid: input.accountSid, authToken: input.authToken });
    return {
      id: saved.id,
      providerKey: 'twilio-sms',
      channel: 'SMS',
      enabled: saved.enabled,
      publicConfig: { fromNumber: saved.fromNumber },
      version: saved.version,
      credentialsConfigured: true,
      credentialFields: ['accountSid', 'authToken'],
    };
  }
}
