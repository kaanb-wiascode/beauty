import { Body, Controller, Get, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { TrainingBulkAssignmentService } from './training-bulk-assignment.service';

const uuid = z.string().uuid();
const bulkAssignmentSchema = z.object({
  courseId: uuid,
  targetType: z.enum(['PERSONNEL','BRANCH','POSITION']),
  targetIds: z.array(uuid).min(1).max(1000),
  dueAt: z.string().datetime().nullable().optional(),
  note: z.string().trim().max(2000).nullable().optional(),
  idempotencyKey: z.string().trim().min(8).max(200),
});

@Controller('training/assignments')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
export class TrainingBulkAssignmentController {
  constructor(private readonly bulk: TrainingBulkAssignmentService) {}

  private userId(req: { user?: { sub?: string } }) {
    const id = req.user?.sub;
    if (!id) throw new UnauthorizedException('Authenticated user id is missing.');
    return id;
  }

  @Get('targets')
  @RequirePermission('training','manage')
  targets() {
    return this.bulk.targets();
  }

  @Post('bulk')
  @RequirePermission('training','manage')
  create(@Body() body: unknown, @Req() req: { user?: { sub?: string } }) {
    return this.bulk.createBulk(bulkAssignmentSchema.parse(body), this.userId(req));
  }
}
