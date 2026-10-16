import { BadRequestException,Body,Controller,Get,Param,Patch,Post,Query,Req,Res,UnauthorizedException,UploadedFile,UseGuards,UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
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

  @Post('employees/:id/documents/upload')
  @RequirePermissions({resource:'hr',action:'manage'},{resource:'hr_sensitive',action:'read'})
  @UseInterceptors(FileInterceptor('file',{limits:{fileSize:10*1024*1024}}))
  uploadDocument(@Param('id')id:string,@UploadedFile()file:any,@Body()b:any,@Req()r:any){
    if(!file)throw new BadRequestException('Yüklenecek dosyayı seçin.');
    const allowed=new Set(['application/pdf','image/jpeg','image/png','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']);
    if(!allowed.has(String(file.mimetype||'')))throw new BadRequestException('PDF, JPG, PNG, Word veya Excel dosyası yükleyebilirsiniz.');
    return this.documents.create(id,{...b,fileName:file.originalname,mimeType:file.mimetype,fileSize:file.size,fileKey:null,restricted:String(b.restricted??'true')!=='false'},this.userId(r),file.buffer);
  }

  @Get('employees/:id/documents/:documentId/download')
  @RequirePermissions({resource:'hr_sensitive',action:'read'})
  async downloadDocument(@Param('id')id:string,@Param('documentId')documentId:string,@Res()res:Response){
    const file=await this.documents.download(id,documentId);
    res.setHeader('content-type',file.mimeType||'application/octet-stream');
    res.setHeader('content-disposition',`attachment; filename*=UTF-8''${encodeURIComponent(file.fileName||'belge')}`);
    res.setHeader('cache-control','private, no-store');
    res.send(file.fileData);
  }

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
