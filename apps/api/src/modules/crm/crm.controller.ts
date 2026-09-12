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
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import {
  completeFollowUpSchema,
  createFollowUpSchema,
  createLeadSchema,
  leadStatusSchema,
  opportunityStageSchema,
  qualifyLeadSchema,
  transitionOpportunitySchema,
  updateLeadSchema,
} from './crm.schemas';
import { CrmService } from './crm.service';

@Controller('crm')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
export class CrmController {
  constructor(private readonly crm: CrmService) {}

  private userId(request: { user?: { sub?: string } }) {
    const id = request.user?.sub;
    if (!id)
      throw new UnauthorizedException('Authenticated user id is missing.');
    return id;
  }

  @Get('assignees')
  @RequirePermission('crm', 'read')
  listAssignees() {
    return this.crm.listAssignees();
  }

  @Get('leads')
  @RequirePermission('crm', 'read')
  listLeads(
    @Query('status') status?: string,
    @Query('ownerUserId') ownerUserId?: string,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
  ) {
    return this.crm.listLeads({
      status: status ? leadStatusSchema.parse(status) : undefined,
      ownerUserId,
      search,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('leads/:id')
  @RequirePermission('crm', 'read')
  getLead(@Param('id') id: string) {
    return this.crm.getLead(id);
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
      id,
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
      id,
      qualifyLeadSchema.parse(body),
      this.userId(request),
    );
  }

  @Get('opportunities')
  @RequirePermission('crm', 'read')
  listOpportunities(
    @Query('stage') stage?: string,
    @Query('ownerUserId') ownerUserId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.crm.listOpportunities({
      stage: stage ? opportunityStageSchema.parse(stage) : undefined,
      ownerUserId,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post('opportunities/:id/transition')
  @RequirePermission('crm', 'manage')
  transitionOpportunity(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: { user?: { sub?: string } },
  ) {
    return this.crm.transitionOpportunity(
      id,
      transitionOpportunitySchema.parse(body),
      this.userId(request),
    );
  }

  @Get('follow-ups')
  @RequirePermission('crm', 'read')
  listFollowUps(
    @Query('status') status?: string,
    @Query('assignedUserId') assignedUserId?: string,
    @Query('dueBefore') dueBefore?: string,
    @Query('limit') limit?: string,
  ) {
    return this.crm.listFollowUps({
      status,
      assignedUserId,
      dueBefore: dueBefore ? new Date(dueBefore) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
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
    const input = completeFollowUpSchema.parse(body);
    return this.crm.completeFollowUp(id, input.outcome, this.userId(request));
  }
}
