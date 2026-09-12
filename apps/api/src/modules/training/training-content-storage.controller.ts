import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { TrainingContentStorageService } from './training-content-storage.service';

@Controller('training/content')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
export class TrainingContentStorageController {
  constructor(private readonly content: TrainingContentStorageService) {}

  @Post('versions/:versionId/documents/prepare')
  @RequirePermission('training', 'manage')
  prepare(@Param('versionId') versionId: string, @Body() body: any) {
    return this.content.prepareDocumentUpload(versionId, {
      filename: body.filename ?? null,
      mimeType: body.mimeType ?? null,
      byteSize: body.byteSize ?? null,
    });
  }

  @Post('versions/:versionId/documents/verify')
  @RequirePermission('training', 'manage')
  verify(@Param('versionId') versionId: string, @Body() body: any) {
    return this.content.verifyDocument(versionId, String(body.objectKey ?? ''));
  }

  @Get('lessons/:lessonId/document')
  @RequirePermission('training', 'read')
  download(@Param('lessonId') lessonId: string) {
    return this.content.downloadLessonDocument(lessonId);
  }
}
