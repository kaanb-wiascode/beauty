import { Body, Controller, Get, Param, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';

import { PlatformJwtAuthGuard } from '../../common/auth/platform-jwt-auth.guard';
import { RequirePlatformPermission } from '../../common/auth/platform-permissions.decorator';
import { PlatformPermissionsGuard } from '../../common/auth/platform-permissions.guard';
import type { PlatformRequestLike } from './platform-request-context';
import { PlatformEntitlementsService } from './platform-entitlements.service';

type PlatformRequest = PlatformRequestLike & { user?: { sub?: string } };

@Controller('platform')
@UseGuards(PlatformJwtAuthGuard, PlatformPermissionsGuard)
export class PlatformEntitlementsController {
  constructor(private readonly entitlements: PlatformEntitlementsService) {}

  @Get('entitlements')
  @RequirePlatformPermission('entitlements', 'read')
  listCatalog() {
    return this.entitlements.listCatalog();
  }

  @Post('plans/:planVersionId/entitlements/:entitlementKey')
  @RequirePlatformPermission('entitlements', 'manage')
  setPlanEntitlement(
    @Req() request: PlatformRequest,
    @Param('planVersionId') planVersionId: string,
    @Param('entitlementKey') entitlementKey: string,
    @Body() body: { value?: unknown },
  ) {
    return this.entitlements.setPlanEntitlement(this.actor(request), planVersionId, entitlementKey, body.value);
  }

  @Get('customers/:tenantId/entitlements')
  @RequirePlatformPermission('entitlements', 'read')
  getTenantEntitlements(@Param('tenantId') tenantId: string) {
    return this.entitlements.getTenantEntitlements(tenantId);
  }

  @Post('customers/:tenantId/entitlement-overrides')
  @RequirePlatformPermission('entitlements', 'manage')
  createOverride(
    @Req() request: PlatformRequest,
    @Param('tenantId') tenantId: string,
    @Body() body: { entitlementKey?: string; value?: unknown; reason?: string; startsAt?: string | null; endsAt?: string | null },
  ) {
    return this.entitlements.createOverride(this.actor(request), tenantId, {
      entitlementKey: body.entitlementKey ?? '',
      value: body.value,
      reason: body.reason ?? '',
      startsAt: body.startsAt,
      endsAt: body.endsAt,
    });
  }

  @Post('customers/:tenantId/entitlement-overrides/:overrideId/revoke')
  @RequirePlatformPermission('entitlements', 'manage')
  revokeOverride(
    @Req() request: PlatformRequest,
    @Param('tenantId') tenantId: string,
    @Param('overrideId') overrideId: string,
    @Body() body: { reason?: string },
  ) {
    return this.entitlements.revokeOverride(this.actor(request), tenantId, overrideId, body.reason ?? '');
  }

  private actor(request: PlatformRequest) {
    const actor = request.user?.sub;
    if (!actor) throw new UnauthorizedException('Authenticated platform actor is missing.');
    return actor;
  }
}
