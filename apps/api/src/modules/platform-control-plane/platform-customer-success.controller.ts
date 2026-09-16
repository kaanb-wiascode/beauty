import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';

import { PlatformJwtAuthGuard } from '../../common/auth/platform-jwt-auth.guard';
import { RequirePlatformPermission } from '../../common/auth/platform-permissions.decorator';
import { PlatformPermissionsGuard } from '../../common/auth/platform-permissions.guard';
import { PlatformCustomerSuccessService } from './platform-customer-success.service';
import { PlatformTenantHealthService } from './platform-tenant-health.service';

type PlatformRequest = {
  user?: { sub?: string };
  headers?: Record<string, string | string[] | undefined>;
};

@Controller('platform/customer-success')
@UseGuards(PlatformJwtAuthGuard, PlatformPermissionsGuard)
export class PlatformCustomerSuccessController {
  constructor(
    private readonly customerSuccess: PlatformCustomerSuccessService,
    private readonly tenantHealth: PlatformTenantHealthService,
  ) {}

  @Get()
  @RequirePlatformPermission('customer_success', 'read')
  list(
    @Query('segment') segment?: string,
    @Query('successStage') successStage?: string,
    @Query('riskStatus') riskStatus?: string,
    @Query('limit') limit?: string,
  ) {
    return this.customerSuccess.listPortfolio({
      segment,
      successStage,
      riskStatus,
      limit: this.parseOptionalLimit(limit),
    });
  }

  @Get('health')
  @RequirePlatformPermission('tenant_health', 'read')
  listHealth(@Query('limit') limit?: string) {
    return this.tenantHealth.listLatest(this.parseOptionalLimit(limit));
  }

  @Get(':tenantId')
  @RequirePlatformPermission('customer_success', 'read')
  detail(@Param('tenantId') tenantId: string) {
    return this.customerSuccess.getDetail(tenantId);
  }

  @Patch(':tenantId')
  @RequirePlatformPermission('customer_success', 'manage')
  update(
    @Req() request: PlatformRequest,
    @Param('tenantId') tenantId: string,
    @Body()
    body: {
      segment?: string;
      successStage?: string;
      riskStatus?: string;
      riskReason?: string | null;
      nextReviewAt?: string | null;
      reason?: string;
    },
  ) {
    return this.customerSuccess.updateAccount(
      tenantId,
      this.actor(request),
      body,
      body.reason ?? '',
      this.correlationId(request),
    );
  }

  @Post(':tenantId/events')
  @RequirePlatformPermission('customer_success', 'manage')
  createEvent(
    @Req() request: PlatformRequest,
    @Param('tenantId') tenantId: string,
    @Body()
    body: {
      eventType?: string;
      severity?: string;
      summary?: string;
      details?: unknown;
      happenedAt?: string | null;
    },
  ) {
    return this.customerSuccess.addEvent(
      tenantId,
      this.actor(request),
      body,
      this.correlationId(request),
    );
  }

  @Get(':tenantId/health')
  @RequirePlatformPermission('tenant_health', 'read')
  latestHealth(@Param('tenantId') tenantId: string) {
    return this.tenantHealth.getLatest(tenantId);
  }

  @Post(':tenantId/health/recalculate')
  @RequirePlatformPermission('tenant_health', 'recalculate')
  recalculateHealth(
    @Req() request: PlatformRequest,
    @Param('tenantId') tenantId: string,
    @Body() body: { reason?: string },
  ) {
    return this.tenantHealth.recalculate(
      tenantId,
      this.actor(request),
      body.reason ?? '',
      this.correlationId(request),
    );
  }

  private parseOptionalLimit(value?: string) {
    if (value == null || value.trim() === '') return undefined;
    const parsed = Number(value);
    if (!Number.isInteger(parsed)) throw new BadRequestException('limit must be an integer.');
    return parsed;
  }

  private actor(request: PlatformRequest) {
    const actorUserId = request.user?.sub?.trim();
    if (!actorUserId) throw new UnauthorizedException('Platform actor is required.');
    return actorUserId;
  }

  private correlationId(request: PlatformRequest) {
    const value = request.headers?.['x-request-id'];
    return Array.isArray(value) ? value[0] ?? null : value ?? null;
  }
}
