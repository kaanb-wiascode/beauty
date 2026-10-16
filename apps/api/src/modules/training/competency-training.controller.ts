import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { CompetencyTrainingService } from './competency-training.service';

const uuid = z.string().uuid();
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const createRuleSchema = z.object({
  name: z.string().trim().min(1).max(200),
  competencyId: uuid,
  courseId: uuid,
  minimumGap: z.coerce.number().positive().max(100).optional(),
  priority: z.coerce.number().int().min(1).max(10000).optional(),
  dueDays: z.coerce.number().int().min(0).max(3650).optional(),
  cooldownDays: z.coerce.number().int().min(0).max(3650).optional(),
  effectiveFrom: dateOnly.optional(),
  effectiveTo: dateOnly.nullable().optional(),
});

@Controller('training/competency-training')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
export class CompetencyTrainingController {
  constructor(
    private readonly competencyTraining: CompetencyTrainingService,
  ) {}

  private userId(req: { user?: { sub?: string } }) {
    const id = req.user?.sub;
    if (!id) {
      throw new UnauthorizedException('Authenticated user id is missing.');
    }
    return id;
  }

  @Get('rules')
  @RequirePermission('training', 'read')
  rules() {
    return this.competencyTraining.listRules();
  }

  @Post('rules')
  @RequirePermission('training', 'manage')
  createRule(
    @Body() body: unknown,
    @Req() req: { user?: { sub?: string } },
  ) {
    return this.competencyTraining.createRule(
      createRuleSchema.parse(body),
      this.userId(req),
    );
  }

  @Get('staff/:staffId/recommendations')
  @RequirePermission('training', 'read')
  recommendations(@Param('staffId') staffId: string) {
    return this.competencyTraining.recommendations(uuid.parse(staffId));
  }

  @Post('staff/:staffId/process')
  @RequirePermission('training', 'manage')
  process(
    @Param('staffId') staffId: string,
    @Req() req: { user?: { sub?: string } },
  ) {
    return this.competencyTraining.process(
      uuid.parse(staffId),
      this.userId(req),
    );
  }
}
