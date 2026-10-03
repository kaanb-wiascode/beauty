import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { QualityScoreService } from './quality-score.service';

@Controller('quality/scores')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
export class QualityScoreController {
  constructor(private readonly scores: QualityScoreService) {}

  private userId(req: { user?: { sub?: string } }) {
    const id = req.user?.sub;
    if (!id) throw new UnauthorizedException('Authenticated user id is missing.');
    return id;
  }

  @Post('policies')
  @RequirePermission('quality', 'manage')
  createPolicy(@Body() body: any, @Req() req: { user?: { sub?: string } }) {
    return this.scores.createPolicy(
      {
        name: body.name,
        missingDataStrategy: body.missingDataStrategy,
        maxPenaltyPoints: body.maxPenaltyPoints,
        effectiveFrom: body.effectiveFrom,
        effectiveTo: body.effectiveTo ?? null,
        dimensions: Array.isArray(body.dimensions) ? body.dimensions : [],
        penaltyRules: Array.isArray(body.penaltyRules) ? body.penaltyRules : [],
      },
      this.userId(req),
    );
  }

  @Get('policies')
  @RequirePermission('quality', 'read')
  listPolicies() {
    return this.scores.listPolicies();
  }

  @Post('calculate')
  @RequirePermission('quality', 'manage')
  calculate(@Body() body: any, @Req() req: { user?: { sub?: string } }) {
    return this.scores.calculate(
      {
        periodStart: String(body.periodStart ?? ''),
        periodEnd: String(body.periodEnd ?? ''),
        policyId: body.policyId ? String(body.policyId) : null,
      },
      this.userId(req),
    );
  }

  @Get()
  @RequirePermission('quality', 'read')
  list(@Query('limit') limit?: string) {
    return this.scores.listScores(limit ? Number(limit) : undefined);
  }
}
