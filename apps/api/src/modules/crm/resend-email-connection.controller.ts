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
  fromEmail: z.string().trim().email().max(320),
  fromName: z.string().trim().max(120).optional().default(''),
  apiKey: z.string().trim().min(20).max(300),
});

@Controller('crm/message-provider-connections/resend-email')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
export class ResendEmailConnectionController {
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
    const saved = await this.connections.saveResendEmailPublicConfig(input, actorUserId);
    await this.vault.store(saved.id, { apiKey: input.apiKey });
    return {
      id: saved.id,
      providerKey: 'resend-email',
      channel: 'EMAIL',
      enabled: saved.enabled,
      publicConfig: { fromEmail: saved.fromEmail, fromName: saved.fromName },
      version: saved.version,
      credentialsConfigured: true,
      credentialFields: ['apiKey'],
    };
  }
}
