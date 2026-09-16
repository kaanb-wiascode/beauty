import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';

import { PlatformJwtAuthGuard } from '../../common/auth/platform-jwt-auth.guard';
import { RequirePlatformPermission } from '../../common/auth/platform-permissions.decorator';
import { PlatformPermissionsGuard } from '../../common/auth/platform-permissions.guard';
import type { PlatformRequestLike } from './platform-request-context';
import { PlatformOnboardingService } from './platform-onboarding.service';

type PlatformRequest = PlatformRequestLike & {
  user?: { sub?: string };
  headers?: Record<string, string | string[] | undefined>;
};
type ItemStatus = 'PENDING' | 'IN_PROGRESS' | 'BLOCKED' | 'COMPLETED' | 'SKIPPED';

@Controller('platform/onboarding')
@UseGuards(PlatformJwtAuthGuard, PlatformPermissionsGuard)
export class PlatformOnboardingController {
  constructor(private readonly onboarding: PlatformOnboardingService) {}

  @Get(':tenantId')
  @RequirePlatformPermission('onboarding', 'read')
  get(@Param('tenantId') tenantId: string) {
    return this.onboarding.get(tenantId);
  }

  @Post(':tenantId/bootstrap')
  @RequirePlatformPermission('onboarding', 'manage')
  bootstrap(
    @Req() request: PlatformRequest,
    @Param('tenantId') tenantId: string,
    @Body() body: { provisioningRunId?: string | null; reason?: string },
  ) {
    return this.onboarding.ensureChecklist(tenantId, this.actor(request), {
      provisioningRunId: body.provisioningRunId ?? null,
      reason: body.reason ?? null,
      correlationId: this.correlationId(request),
    });
  }

  @Patch(':tenantId/items/:itemKey')
  @RequirePlatformPermission('onboarding', 'manage')
  updateItem(
    @Req() request: PlatformRequest,
    @Param('tenantId') tenantId: string,
    @Param('itemKey') itemKey: string,
    @Body() body: { status?: string; notes?: string | null; reason?: string },
  ) {
    const status = (body.status ?? '').trim().toUpperCase() as ItemStatus;
    if (!['PENDING', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'SKIPPED'].includes(status)) {
      throw new BadRequestException('Invalid onboarding item status.');
    }
    return this.onboarding.updateItem(
      tenantId,
      itemKey.trim().toUpperCase(),
      status,
      this.actor(request),
      {
        notes: body.notes ?? null,
        reason: body.reason ?? null,
        correlationId: this.correlationId(request),
      },
    );
  }

  private actor(request: PlatformRequest) {
    const actor = request.user?.sub?.trim();
    if (!actor) throw new UnauthorizedException('Platform actor is required.');
    return actor;
  }

  private correlationId(request: PlatformRequest) {
    const value = request.headers?.['x-request-id'];
    return Array.isArray(value) ? value[0] ?? null : value ?? null;
  }
}
