import { Body,Controller,Get,Param,Patch,Post,Query,Req,UnauthorizedException,UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission,RequirePermissions } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { CertificationService } from './certification.service';

@Controller('hr')
@UseGuards(JwtAuthGuard,TenantAuthGuard,PermissionsGuard)
@RequirePermission('hr','read')
export class CertificationController {
 constructor(private readonly certifications:CertificationService){}
 private userId(r:{user?:{sub?:string}}){const id=r.user?.sub;if(!id)throw new UnauthorizedException('Authenticated user id is missing.');return id}

 @Get('certification-types')
 types(@Query('all')all?:string){return this.certifications.types(all!=='true')}

 @Post('certification-types')
 @RequirePermissions({resource:'hr',action:'manage'},{resource:'hr_sensitive',action:'read'})
 createType(@Body()body:any){return this.certifications.createType(body)}

 @Get('employees/:id/certifications')
 @RequirePermissions({resource:'hr_sensitive',action:'read'})
 employeeCertifications(@Param('id')id:string){return this.certifications.list(id)}

 @Post('employees/:id/certifications')
 @RequirePermissions({resource:'hr',action:'manage'},{resource:'hr_sensitive',action:'read'})
 create(@Param('id')id:string,@Body()body:any,@Req()req:any){return this.certifications.create(id,body,this.userId(req))}

 @Patch('employees/:id/certifications/:certificationId/verify')
 @RequirePermissions({resource:'hr',action:'manage'},{resource:'hr_sensitive',action:'read'})
 verify(@Param('id')id:string,@Param('certificationId')certificationId:string,@Body()body:any,@Req()req:any){return this.certifications.verify(id,certificationId,body,this.userId(req))}

 @Post('employees/:id/certifications/:certificationId/revoke')
 @RequirePermissions({resource:'hr',action:'manage'},{resource:'hr_sensitive',action:'read'})
 revoke(@Param('id')id:string,@Param('certificationId')certificationId:string,@Body()body:any,@Req()req:any){return this.certifications.revoke(id,certificationId,body?.note,this.userId(req))}

 @Get('certifications/expiring')
 @RequirePermissions({resource:'hr_sensitive',action:'read'})
 expiring(@Query('days')days?:string){return this.certifications.expiring(days?Number(days):30)}

 @Get('employees/:id/service-eligibility/:serviceId')
 @RequirePermissions({resource:'hr_sensitive',action:'read'})
 serviceEligibility(@Param('id')id:string,@Param('serviceId')serviceId:string){return this.certifications.serviceEligibility(id,serviceId)}
}
