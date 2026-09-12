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
import {
  cancelFollowUpSchema,
  completeFollowUpSchema,
  createFollowUpSchema,
  createLeadSchema,
  leadStatusSchema,
  opportunityStageSchema,
  qualifyLeadSchema,
  rescheduleFollowUpSchema,
  transitionOpportunitySchema,
  updateLeadSchema,
} from './crm.schemas';
import { CrmService } from './crm.service';

const uuid = z.string().uuid();
const listLeadsSchema = z.object({
  status: leadStatusSchema.optional(),
  ownerUserId: uuid.optional(),
  search: z.string().trim().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});
const listOpportunitiesSchema = z.object({
  stage: opportunityStageSchema.optional(),
  ownerUserId: uuid.optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});
const listFollowUpsSchema = z.object({
  status: z.enum(['OPEN', 'COMPLETED', 'CANCELLED']).optional(),
  assignedUserId: uuid.optional(),
  dueBefore: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

@Controller('crm')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
export class CrmController {
  constructor(private readonly crm: CrmService) {}

  private userId(request: { user?: { sub?: string } }) {
    const id = request.user?.sub;
    if (!id) {
      throw new UnauthorizedException('Authenticated user id is missing.');
    }
    return id;
  }

  @Get('assignees')
  @RequirePermission('crm', 'read')
  listAssignees() {
    return this.crm.listAssignees();
  }

  @Get('leads')
  @RequirePermission('crm', 'read')
  listLeads(@Query() query: unknown) {
    return this.crm.listLeads(listLeadsSchema.parse(query));
  }

  @Get('leads/:id')
  @RequirePermission('crm', 'read')
  getLead(@Param('id') id: string) {
    return this.crm.getLead(uuid.parse(id));
  }

  @Post('leads')
  @RequirePermission('crm', 'manage')
  createLead(
    @Body() body: unknown,
    @Req() request: { user?: { sub?: string } },
  ) {
    return this.crm.createLead(
      createLeadSchema.parse(body),
      this.userId(request),
    );
  }

  @Patch('leads/:id')
  @RequirePermission('crm', 'manage')
  updateLead(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: { user?: { sub?: string } },
  ) {
    return this.crm.updateLead(
      uuid.parse(id),
      updateLeadSchema.parse(body),
      this.userId(request),
    );
  }

  @Post('leads/:id/qualify')
  @RequirePermission('crm', 'manage')
  qualifyLead(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: { user?: { sub?: string } },
  ) {
    return this.crm.qualifyLead(
      uuid.parse(id),
      qualifyLeadSchema.parse(body),
      this.userId(request),
    );
  }

  @Get('opportunities')
  @RequirePermission('crm', 'read')
  listOpportunities(@Query() query: unknown) {
    return this.crm.listOpportunities(
      listOpportunitiesSchema.parse(query),
    );
  }

  @Post('opportunities/:id/transition')
  @RequirePermission('crm', 'manage')
  transitionOpportunity(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: { user?: { sub?: string } },
  ) {
    return this.crm.transitionOpportunity(
      uuid.parse(id),
      transitionOpportunitySchema.parse(body),
      this.userId(request),
    );
  }

  @Get('follow-ups')
  @RequirePermission('crm', 'read')
  listFollowUps(@Query() query: unknown) {
    return this.crm.listFollowUps(listFollowUpsSchema.parse(query));
  }

  @Post('follow-ups')
  @RequirePermission('crm', 'manage')
  createFollowUp(
    @Body() body: unknown,
    @Req() request: { user?: { sub?: string } },
  ) {
    return this.crm.createFollowUp(
      createFollowUpSchema.parse(body),
      this.userId(request),
    );
  }

  @Post('follow-ups/:id/complete')
  @RequirePermission('crm', 'manage')
  completeFollowUp(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: { user?: { sub?: string } },
  ) {
    return this.crm.completeFollowUp(
      uuid.parse(id),
      completeFollowUpSchema.parse(body),
      this.userId(request),
    );
  }

  @Post('follow-ups/:id/reschedule')
  @RequirePermission('crm', 'manage')
  rescheduleFollowUp(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: { user?: { sub?: string } },
  ) {
    return this.crm.rescheduleFollowUp(
      uuid.parse(id),
      rescheduleFollowUpSchema.parse(body),
      this.userId(request),
    );
  }

  @Post('follow-ups/:id/cancel')
  @RequirePermission('crm', 'manage')
  cancelFollowUp(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: { user?: { sub?: string } },
  ) {
    return this.crm.cancelFollowUp(
      uuid.parse(id),
      cancelFollowUpSchema.parse(body),
      this.userId(request),
    );
  }
}
