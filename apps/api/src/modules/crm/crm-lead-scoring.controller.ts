import {
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
import { z } from 'zod';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { CrmLeadScoringService } from './crm-lead-scoring.service';

const uuid = z.string().uuid();
const policySchema = z.object({
  warmMin: z.coerce.number().int().min(1).max(99),
  hotMin: z.coerce.number().int().min(2).max(100),
  version: z.coerce.number().int().min(0),
}).refine((value) => value.warmMin < value.hotMin, {
  message: 'warmMin must be lower than hotMin.',
  path: ['hotMin'],
});
const overrideSchema = z.object({
  score: z.coerce.number().int().min(0).max(100),
  reason: z.string().trim().min(3).max(1000),
  version: z.coerce.number().int().min(1),
});
const historySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

@Controller('crm')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
export class CrmLeadScoringController {
  constructor(private readonly scoring: CrmLeadScoringService) {}

  private userId(request: { user?: { sub?: string } }) {
    const id = request.user?.sub;
    if (!id) throw new UnauthorizedException('Authenticated user id is missing.');
    return id;
  }

  @Get('lead-scoring/policy')
  @RequirePermission('crm', 'read')
  getPolicy() {
    return this.scoring.getPolicy();
  }

  @Patch('lead-scoring/policy')
  @RequirePermission('crm', 'manage')
  updatePolicy(@Body() body: unknown, @Req() request: { user?: { sub?: string } }) {
    return this.scoring.updatePolicy(policySchema.parse(body), this.userId(request));
  }

  @Get('leads/:id/score')
  @RequirePermission('crm', 'read')
  getLeadScore(@Param('id') id: string) {
    return this.scoring.getLeadScore(uuid.parse(id));
  }

  @Get('leads/:id/score-history')
  @RequirePermission('crm', 'read')
  getLeadScoreHistory(@Param('id') id: string, @Query() query: unknown) {
    const filters = historySchema.parse(query);
    return this.scoring.listHistory(uuid.parse(id), filters.limit);
  }

  @Post('leads/:id/score-override')
  @RequirePermission('crm', 'manage')
  overrideLeadScore(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: { user?: { sub?: string } },
  ) {
    return this.scoring.overrideScore(uuid.parse(id), overrideSchema.parse(body), this.userId(request));
  }

  @Post('leads/:id/rescore')
  @RequirePermission('crm', 'manage')
  recalculateLeadScore(@Param('id') id: string, @Req() request: { user?: { sub?: string } }) {
    return this.scoring.recalculate(uuid.parse(id), this.userId(request));
  }
}
