import { Body, Controller, Get, Param, Patch, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission, RequirePermissions } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { RecruitmentService } from './recruitment.service';

@Controller('hr/recruitment')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
@RequirePermission('hr', 'read')
export class RecruitmentController {
  constructor(private readonly recruitment: RecruitmentService) {}

  private actor(req: { user?: { sub?: string } }) {
    const id = req.user?.sub;
    if (!id) throw new UnauthorizedException('Authenticated user id is missing.');
    return id;
  }

  @Get('jobs')
  jobs() {
    return this.recruitment.jobs();
  }

  @Post('jobs')
  @RequirePermissions({ resource: 'hr', action: 'manage' })
  createJob(@Body() body: any, @Req() req: any) {
    return this.recruitment.createJob(body, this.actor(req));
  }

  @Get('candidates')
  candidates() {
    return this.recruitment.candidates();
  }

  @Post('candidates')
  @RequirePermissions({ resource: 'hr', action: 'manage' })
  createCandidate(@Body() body: any) {
    return this.recruitment.createCandidate(body);
  }

  @Get('applications')
  applications() {
    return this.recruitment.applications();
  }

  @Post('applications')
  @RequirePermissions({ resource: 'hr', action: 'manage' })
  createApplication(@Body() body: any) {
    return this.recruitment.createApplication(body);
  }

  @Patch('applications/:id/stage')
  @RequirePermissions({ resource: 'hr', action: 'manage' })
  updateStage(@Param('id') id: string, @Body() body: any) {
    return this.recruitment.updateStage(id, body);
  }

  @Post('applications/:id/hire')
  @RequirePermissions({ resource: 'hr', action: 'manage' })
  hire(@Param('id') id: string, @Body() body: any) {
    return this.recruitment.hire(id, body);
  }

  @Get('interviews')
  interviews() {
    return this.recruitment.interviews();
  }

  @Post('interviews')
  @RequirePermissions({ resource: 'hr', action: 'manage' })
  createInterview(@Body() body: any) {
    return this.recruitment.createInterview(body);
  }

  @Get('offers')
  offers() {
    return this.recruitment.offers();
  }

  @Post('offers')
  @RequirePermissions({ resource: 'hr', action: 'manage' })
  createOffer(@Body() body: any) {
    return this.recruitment.createOffer(body);
  }

  @Patch('offers/:id/respond')
  @RequirePermissions({ resource: 'hr', action: 'manage' })
  respondOffer(@Param('id') id: string, @Body() body: any) {
    return this.recruitment.respondOffer(id, body);
  }
}
