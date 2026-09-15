import { Body,Controller,Get,Param,Patch,Post,Query,Req,UnauthorizedException,UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission,RequirePermissions } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { PersonnelDocumentService } from './personnel-document.service';
import { PersonnelDocumentComplianceService } from './personnel-document-compliance.service';

@Controller('hr')
@UseGuards(JwtAuthGuard,TenantAuthGuard,PermissionsGuard)
@RequirePermission('hr','read')
export class PersonnelDocumentController {
  constructor(private readonly documents:PersonnelDocumentService,private readonly compliance:PersonnelDocumentComplianceService){}
  private userId(r:{user?:{sub?:string}}){const id=r.user?.sub;if(!id)throw new UnauthorizedException('Authenticated user id is missing.');return id}

  @Get('employees/:id/documents')
  documentsForEmployee(@Param('id')id:string){return this.documents.list(id,false)}

  @Get('employees/:id/documents/sensitive')
  @RequirePermissions({resource:'hr_sensitive',action:'read'})
  sensitiveDocumentsForEmployee(@Param('id')id:string){return this.documents.list(id,true)}

  @Get('employees/:id/document-compliance')
  documentCompliance(@Param('id')id:string){return this.compliance.employee(id,false)}

  @Get('employees/:id/document-compliance/sensitive')
  @RequirePermissions({resource:'hr_sensitive',action:'read'})
  sensitiveDocumentCompliance(@Param('id')id:string){return this.compliance.employee(id,true)}

  @Post('employees/:id/documents')
  @RequirePermissions({resource:'hr',action:'manage'},{resource:'hr_sensitive',action:'read'})
  createDocument(@Param('id')id:string,@Body()b:any,@Req()r:any){return this.documents.create(id,b,this.userId(r))}

  @Patch('employees/:id/documents/:documentId/verify')
  @RequirePermissions({resource:'hr',action:'manage'},{resource:'hr_sensitive',action:'read'})
  verifyDocument(@Param('id')id:string,@Param('documentId')documentId:string,@Body()b:any,@Req()r:any){return this.documents.verify(id,documentId,b,this.userId(r))}

  @Post('employees/:id/documents/:documentId/archive')
  @RequirePermissions({resource:'hr',action:'manage'},{resource:'hr_sensitive',action:'read'})
  archiveDocument(@Param('id')id:string,@Param('documentId')documentId:string){return this.documents.archive(id,documentId)}

  @Get('personnel-documents/expiring')
  expiring(@Query('days')days?:string){return this.documents.expiring(days?Number(days):30,false)}

  @Get('personnel-documents/expiring/sensitive')
  @RequirePermissions({resource:'hr_sensitive',action:'read'})
  sensitiveExpiring(@Query('days')days?:string){return this.documents.expiring(days?Number(days):30,true)}

  @Get('personnel-documents/compliance')
  complianceOverview(){return this.compliance.overview(false)}

  @Get('personnel-documents/compliance/sensitive')
  @RequirePermissions({resource:'hr_sensitive',action:'read'})
  sensitiveComplianceOverview(){return this.compliance.overview(true)}
}
