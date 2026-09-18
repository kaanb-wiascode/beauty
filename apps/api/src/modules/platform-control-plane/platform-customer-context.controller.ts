import { Body, Controller, Get, Param, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';

import { PlatformJwtAuthGuard } from '../../common/auth/platform-jwt-auth.guard';
import { RequirePlatformPermission } from '../../common/auth/platform-permissions.decorator';
import { PlatformPermissionsGuard } from '../../common/auth/platform-permissions.guard';
import type { PlatformRequestLike } from './platform-request-context';
import { PlatformCustomerContextService } from './platform-customer-context.service';

type PlatformRequest = PlatformRequestLike & { user?: { sub?: string } };

@Controller('platform/customers')
@UseGuards(PlatformJwtAuthGuard, PlatformPermissionsGuard)
export class PlatformCustomerContextController {
  constructor(private readonly customerContext: PlatformCustomerContextService) {}

  @Get(':tenantId/context')
  @RequirePlatformPermission('customers', 'read')
  getContext(@Param('tenantId') tenantId: string) {
    return this.customerContext.get(tenantId);
  }

  @Post(':tenantId/context')
  @RequirePlatformPermission('customers', 'manage')
  updateContext(
    @Req() request: PlatformRequest,
    @Param('tenantId') tenantId: string,
    @Body() body: {
      legalName?: string | null;
      accountOwnerUserId?: string | null;
      customerSuccessOwnerUserId?: string | null;
      goLiveAt?: string | null;
      renewalAt?: string | null;
    },
  ) {
    return this.customerContext.updateAccount(this.actor(request), tenantId, body);
  }

  @Post(':tenantId/notes')
  @RequirePlatformPermission('customers', 'manage')
  addNote(
    @Req() request: PlatformRequest,
    @Param('tenantId') tenantId: string,
    @Body() body: { body?: string },
  ) {
    return this.customerContext.addNote(this.actor(request), tenantId, body.body ?? '');
  }

  private actor(request: PlatformRequest) {
    const actorUserId = request.user?.sub;
    if (!actorUserId) throw new UnauthorizedException('Authenticated platform actor is missing.');
    return actorUserId;
  }
}
