import { Body, Controller, Get, Param, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { CompetencyService } from './competency.service';

@Controller('training/competencies')
@UseGuards(JwtAuthGuard,TenantAuthGuard,PermissionsGuard)
export class CompetencyController {
  constructor(private readonly competency:CompetencyService){}
  private userId(req:{user?:{sub?:string}}){const id=req.user?.sub;if(!id)throw new UnauthorizedException('Authenticated user id is missing.');return id;}

  @Get('definitions') @RequirePermission('training','read')
  definitions(){return this.competency.listDefinitions();}

  @Post('definitions') @RequirePermission('training','manage')
  createDefinition(@Body()b:any,@Req()req:{user?:{sub?:string}}){return this.competency.createDefinition(b,this.userId(req));}

  @Get('profiles') @RequirePermission('training','read')
  profiles(){return this.competency.listProfiles();}

  @Post('profiles') @RequirePermission('training','manage')
  createProfile(@Body()b:any,@Req()req:{user?:{sub?:string}}){return this.competency.createProfile(b,this.userId(req));}

  @Post('staff/:staffId/profile') @RequirePermission('training','manage')
  assignProfile(@Param('staffId')staffId:string,@Body()b:any,@Req()req:{user?:{sub?:string}}){return this.competency.assignProfile(staffId,b,this.userId(req));}

  @Post('staff/:staffId/assessments') @RequirePermission('training','manage')
  assess(@Param('staffId')staffId:string,@Body()b:any,@Req()req:{user?:{sub?:string}}){return this.competency.assess(staffId,b,this.userId(req));}

  @Get('staff/:staffId/gaps') @RequirePermission('training','read')
  gaps(@Param('staffId')staffId:string){return this.competency.gaps(staffId);}
}
