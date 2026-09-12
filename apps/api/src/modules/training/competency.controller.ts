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
import { CompetencyService } from './competency.service';

const uuid = z.string().uuid();
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const definitionSchema = z.object({
  code: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  category: z.string().trim().min(1).max(100).optional(),
});

const profileSchema = z.object({
  code: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  effectiveFrom: dateOnly.optional(),
  effectiveTo: dateOnly.nullable().optional(),
  requirements: z
    .array(
      z.object({
        competencyId: uuid,
        requiredLevel: z.coerce.number().min(0).max(100),
        weight: z.coerce.number().positive().optional(),
      }),
    )
    .min(1)
    .max(500),
});

const assignProfileSchema = z.object({
  profileId: uuid,
  effectiveFrom: dateOnly.optional(),
  effectiveTo: dateOnly.nullable().optional(),
});

const assessmentSchema = z.object({
  competencyId: uuid,
  sourceType: z.enum(['MANUAL', 'EXAM', 'PRACTICAL', 'TRAINING', 'QUALITY']),
  score: z.coerce.number().min(0).max(100),
  evidence: z.unknown().optional(),
  note: z.string().trim().max(2000).nullable().optional(),
  assessedAt: z.coerce.date().optional(),
});

@Controller('training/competencies')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
export class CompetencyController {
  constructor(private readonly competency: CompetencyService) {}

  private userId(req: { user?: { sub?: string } }) {
    const id = req.user?.sub;
    if (!id) {
      throw new UnauthorizedException('Authenticated user id is missing.');
    }
    return id;
  }

  @Get('definitions')
  @RequirePermission('training', 'read')
  definitions() {
    return this.competency.listDefinitions();
  }

  @Post('definitions')
  @RequirePermission('training', 'manage')
  createDefinition(
    @Body() body: unknown,
    @Req() req: { user?: { sub?: string } },
  ) {
    return this.competency.createDefinition(
      definitionSchema.parse(body),
      this.userId(req),
    );
  }

  @Get('profiles')
  @RequirePermission('training', 'read')
  profiles() {
    return this.competency.listProfiles();
  }

  @Post('profiles')
  @RequirePermission('training', 'manage')
  createProfile(
    @Body() body: unknown,
    @Req() req: { user?: { sub?: string } },
  ) {
    return this.competency.createProfile(
      profileSchema.parse(body),
      this.userId(req),
    );
  }

  @Post('staff/:staffId/profile')
  @RequirePermission('training', 'manage')
  assignProfile(
    @Param('staffId') staffId: string,
    @Body() body: unknown,
    @Req() req: { user?: { sub?: string } },
  ) {
    return this.competency.assignProfile(
      uuid.parse(staffId),
      assignProfileSchema.parse(body),
      this.userId(req),
    );
  }

  @Post('staff/:staffId/assessments')
  @RequirePermission('training', 'manage')
  assess(
    @Param('staffId') staffId: string,
    @Body() body: unknown,
    @Req() req: { user?: { sub?: string } },
  ) {
    const input = assessmentSchema.parse(body);
    return this.competency.assess(
      uuid.parse(staffId),
      {
        ...input,
        assessedAt: input.assessedAt?.toISOString(),
      },
      this.userId(req),
    );
  }

  @Get('staff/:staffId/gaps')
  @RequirePermission('training', 'read')
  gaps(@Param('staffId') staffId: string) {
    return this.competency.gaps(uuid.parse(staffId));
  }
}
