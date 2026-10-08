import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { CrmTeamService } from './crm-team.service';

const uuid = z.string().uuid();
const createTeamSchema = z.object({
  name: z.string().trim().min(2).max(120),
  managerUserId: z.string().uuid(),
});
const addMemberSchema = z.object({ userId: z.string().uuid() });
const memberSkillsSchema = z.object({ skills: z.array(z.string().trim().min(1).max(120)).max(30) });

@Controller('crm/teams')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
export class CrmTeamController {
  constructor(private readonly teams: CrmTeamService) {}

  @Get()
  @RequirePermission('crm', 'read')
  list() {
    return this.teams.list();
  }

  @Post()
  @RequirePermission('crm', 'manage')
  create(@Body() body: unknown) {
    return this.teams.create(createTeamSchema.parse(body));
  }

  @Post(':teamId/members')
  @RequirePermission('crm', 'manage')
  addMember(@Param('teamId') teamId: string, @Body() body: unknown) {
    const input = addMemberSchema.parse(body);
    return this.teams.addMember(uuid.parse(teamId), input.userId);
  }

  @Put(':teamId/members/:userId/skills')
  @RequirePermission('crm', 'manage')
  setMemberSkills(
    @Param('teamId') teamId: string,
    @Param('userId') userId: string,
    @Body() body: unknown,
  ) {
    const input = memberSkillsSchema.parse(body);
    return this.teams.setMemberSkills(uuid.parse(teamId), uuid.parse(userId), input.skills);
  }

  @Delete(':teamId/members/:userId')
  @RequirePermission('crm', 'manage')
  removeMember(@Param('teamId') teamId: string, @Param('userId') userId: string) {
    return this.teams.removeMember(uuid.parse(teamId), uuid.parse(userId));
  }
}
