import { Body,Controller,Get,Param,Post,Req,UnauthorizedException,UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission,RequirePermissions } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { CompetencyService } from './competency.service';

@Controller('hr')
@UseGuards(JwtAuthGuard,TenantAuthGuard,PermissionsGuard)
@RequirePermission('hr','read')
export class CompetencyController {
 constructor(private readonly competencies:CompetencyService){}
 private userId(req:{user?:{sub?:string}}){const id=req.user?.sub;if(!id)throw new UnauthorizedException('Authenticated user id is missing.');return id}

 @Get('competencies')
 catalog(){return this.competencies.catalog()}

 @Post('competencies')
 @RequirePermissions({resource:'hr',action:'manage'})
 createCompetency(@Body()body:any,@Req()req:any){return this.competencies.createCompetency(body,this.userId(req))}

 @Get('positions/:positionId/competencies')
 positionRequirements(@Param('positionId')positionId:string){return this.competencies.positionRequirements(positionId)}

 @Post('positions/:positionId/competencies')
 @RequirePermissions({resource:'hr',action:'manage'})
 setPositionRequirement(@Param('positionId')positionId:string,@Body()body:any){return this.competencies.setPositionRequirement(positionId,body)}

 @Get('employees/:id/competencies')
 @RequirePermissions({resource:'hr_sensitive',action:'read'})
 employeeMatrix(@Param('id')id:string){return this.competencies.employeeMatrix(id)}

 @Post('employees/:id/competencies/assessments')
 @RequirePermissions({resource:'hr',action:'manage'},{resource:'hr_sensitive',action:'read'})
 assess(@Param('id')id:string,@Body()body:any,@Req()req:any){return this.competencies.assess(id,body,this.userId(req))}

 @Post('employees/:id/competencies/development-actions')
 @RequirePermissions({resource:'hr',action:'manage'},{resource:'hr_sensitive',action:'read'})
 createDevelopmentAction(@Param('id')id:string,@Body()body:any,@Req()req:any){return this.competencies.createDevelopmentAction(id,body,this.userId(req))}
}
