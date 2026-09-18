import { Body, Controller, Get, Param, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';

import { PlatformJwtAuthGuard } from '../../common/auth/platform-jwt-auth.guard';
import { RequirePlatformPermission } from '../../common/auth/platform-permissions.decorator';
import { PlatformPermissionsGuard } from '../../common/auth/platform-permissions.guard';
import type { PlatformRequestLike } from './platform-request-context';
import { PlatformSubscriptionsService } from './platform-subscriptions.service';

type PlatformRequest = PlatformRequestLike & { user?: { sub?: string } };

@Controller('platform')
@UseGuards(PlatformJwtAuthGuard, PlatformPermissionsGuard)
export class PlatformSubscriptionsController {
  constructor(private readonly subscriptions: PlatformSubscriptionsService) {}

  @Get('plans')
  @RequirePlatformPermission('subscriptions', 'read')
  listPlans() {
    return this.subscriptions.listPlans();
  }

  @Post('plans/versions')
  @RequirePlatformPermission('subscriptions', 'manage')
  createPlanVersion(@Req() request: PlatformRequest, @Body() body: {
    code?: string;
    name?: string;
    description?: string | null;
    currency?: string;
    monthlyPrice?: number | null;
    annualPrice?: number | null;
    branchLimit?: number | null;
    userLimit?: number | null;
  }) {
    return this.subscriptions.createPlanVersion(this.actor(request), {
      code: body.code ?? '',
      name: body.name ?? '',
      description: body.description,
      currency: body.currency,
      monthlyPrice: body.monthlyPrice,
      annualPrice: body.annualPrice,
      branchLimit: body.branchLimit,
      userLimit: body.userLimit,
    });
  }

  @Get('customers/:tenantId/subscription')
  @RequirePlatformPermission('subscriptions', 'read')
  getTenantSubscription(@Param('tenantId') tenantId: string) {
    return this.subscriptions.getTenantSubscription(tenantId);
  }

  @Post('customers/:tenantId/subscription')
  @RequirePlatformPermission('subscriptions', 'manage')
  assignTenantSubscription(
    @Req() request: PlatformRequest,
    @Param('tenantId') tenantId: string,
    @Body() body: {
      planVersionId?: string;
      status?: 'TRIAL' | 'ACTIVE' | 'PAST_DUE';
      contractedMonthlyPrice?: number | null;
      contractedAnnualPrice?: number | null;
      discountPercent?: number;
      startsAt?: string | null;
      renewsAt?: string | null;
    },
  ) {
    return this.subscriptions.assignSubscription(this.actor(request), tenantId, {
      planVersionId: body.planVersionId ?? '',
      status: body.status,
      contractedMonthlyPrice: body.contractedMonthlyPrice,
      contractedAnnualPrice: body.contractedAnnualPrice,
      discountPercent: body.discountPercent,
      startsAt: body.startsAt,
      renewsAt: body.renewsAt,
    });
  }

  private actor(request: PlatformRequest) {
    const actor = request.user?.sub;
    if (!actor) throw new UnauthorizedException('Authenticated platform actor is missing.');
    return actor;
  }
}
