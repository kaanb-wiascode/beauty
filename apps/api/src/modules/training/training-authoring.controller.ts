import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { TrainingAuthoringService } from './training-authoring.service';

const uuid = z.string().uuid();
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const updateDraftSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  theoryPassScore: z.coerce.number().min(0).max(100).nullable().optional(),
  practicalPassScore: z.coerce.number().min(0).max(100).nullable().optional(),
  effectiveFrom: dateOnly.nullable().optional(),
  effectiveTo: dateOnly.nullable().optional(),
});

@Controller('training/authoring')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
export class TrainingAuthoringController {
  constructor(private readonly authoring: TrainingAuthoringService) {}

  @Get('versions/:versionId')
  @RequirePermission('training', 'read')
  detail(@Param('versionId') versionId: string) {
    return this.authoring.detail(uuid.parse(versionId));
  }

  @Patch('versions/:versionId')
  @RequirePermission('training', 'manage')
  update(@Param('versionId') versionId: string, @Body() body: unknown) {
    return this.authoring.updateVersion(
      uuid.parse(versionId),
      updateDraftSchema.parse(body),
    );
  }
}
