import { Body, Controller, Get, Patch, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { CrmMessageProviderConnectionsService } from './crm-message-provider-connections.service';
import { CrmMessageProviderVaultService } from './crm-message-provider-vault.service';

const metaSchema = z.object({
  version: z.coerce.number().int().min(1).optional(),
  enabled: z.boolean().default(true),
  phoneNumberId: z.string().trim().min(3).max(120),
  graphApiVersion: z.string().trim().regex(/^v\d+\.\d+$/),
  accessToken: z.string().trim().min(10).max(8000),
  appSecret: z.string().trim().min(8).max(1000),
  verifyToken: z.string().trim().min(8).max(1000),
});

@Controller('crm/message-provider-connections')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
export class CrmMessageProviderConnectionsController {
  constructor(
    private readonly connections: CrmMessageProviderConnectionsService,
    private readonly vault: CrmMessageProviderVaultService,
  ) {}

  @Get()
  @RequirePermission('crm', 'read')
  list() {
    return this.connections.list();
  }

  @Patch('meta-whatsapp')
  @RequirePermission('crm', 'manage')
  async configureMeta(@Body() body: unknown, @Req() request: { user?: { sub?: string } }) {
    const actorUserId = request.user?.sub;
    if (!actorUserId) throw new UnauthorizedException('Authenticated user id is missing.');
    const input = metaSchema.parse(body);
    const saved = await this.connections.saveMetaPublicConfig(input, actorUserId);
    await this.vault.store(saved.id, {
      accessToken: input.accessToken,
      appSecret: input.appSecret,
      verifyToken: input.verifyToken,
    });
    return {
      id: saved.id,
      providerKey: 'meta-whatsapp',
      channel: 'WHATSAPP',
      enabled: saved.enabled,
      publicConfig: { phoneNumberId: saved.phoneNumberId, graphApiVersion: saved.graphApiVersion },
      version: saved.version,
      credentialsConfigured: true,
      credentialFields: ['accessToken', 'appSecret', 'verifyToken'],
    };
  }
}
