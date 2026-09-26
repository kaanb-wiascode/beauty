import { Body, Controller, Get, Post, Query, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { QualitySlaService } from './quality-sla.service';

@Controller('quality/sla')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
export class QualitySlaPolicyController {
  constructor(private readonly sla: QualitySlaService) {}

  private userId(req: { user?: { sub?: string } }) {
    const id = req.user?.sub;
    if (!id) throw new UnauthorizedException('Authenticated user id is missing.');
    return id;
  }

  @Get('policies')
  @RequirePermission('quality', 'read')
  listPolicies(@Query('limit') limit?: string) {
    return this.sla.listPolicies(limit ? Number(limit) : undefined);
  }

  @Post('policies')
  @RequirePermission('quality', 'manage')
  createPolicy(@Body() body: any, @Req() req: { user?: { sub?: string } }) {
    return this.sla.createPolicy(
      {
        name: body.name,
        version: body.version == null ? undefined : Number(body.version),
        category: body.category ?? null,
        sourceType: body.sourceType ?? null,
        severity: body.severity,
        dueMinutes: Number(body.dueMinutes),
        escalation2Minutes: body.escalation2Minutes == null ? null : Number(body.escalation2Minutes),
        escalation3Minutes: body.escalation3Minutes == null ? null : Number(body.escalation3Minutes),
        priority: body.priority == null ? undefined : Number(body.priority),
        effectiveFrom: body.effectiveFrom ?? null,
        effectiveTo: body.effectiveTo ?? null,
      },
      this.userId(req),
    );
  }

  @Post('apply-policies')
  @RequirePermission('quality', 'manage')
  applyPolicies(@Body() body: any, @Req() req: { user?: { sub?: string } }) {
    return this.sla.applyPolicies(this.userId(req), body?.limit == null ? undefined : Number(body.limit));
  }
}
