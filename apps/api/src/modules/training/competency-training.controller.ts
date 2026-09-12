import { Body, Controller, Get, Param, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { CompetencyTrainingService } from './competency-training.service';

@Controller('training/competency-training')
@UseGuards(JwtAuthGuard,TenantAuthGuard,PermissionsGuard)
export class CompetencyTrainingController {
  constructor(private readonly competencyTraining: CompetencyTrainingService) {}

  private userId(req: { user?: { sub?: string } }) {
    const id = req.user?.sub;
    if (!id) throw new UnauthorizedException('Authenticated user id is missing.');
    return id;
  }

  @Get('rules')
  @RequirePermission('training','read')
  rules() {
    return this.competencyTraining.listRules();
  }

  @Post('rules')
  @RequirePermission('training','manage')
  createRule(@Body() body: any,@Req() req: { user?: { sub?: string } }) {
    return this.competencyTraining.createRule(body,this.userId(req));
  }

  @Get('staff/:staffId/recommendations')
  @RequirePermission('training','read')
  recommendations(@Param('staffId') staffId: string) {
    return this.competencyTraining.recommendations(staffId);
  }

  @Post('staff/:staffId/process')
  @RequirePermission('training','manage')
  process(@Param('staffId') staffId: string,@Req() req: { user?: { sub?: string } }) {
    return this.competencyTraining.process(staffId,this.userId(req));
  }
}
