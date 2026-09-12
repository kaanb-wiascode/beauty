import {
  Body,
  Controller,
  Get,
  Param,
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
import { QualityEvidenceService } from './quality-evidence.service';

@Controller('quality/evidence')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
export class QualityEvidenceController {
  constructor(private readonly evidence: QualityEvidenceService) {}

  private userId(req: { user?: { sub?: string } }) {
    const id = req.user?.sub;
    if (!id) {
      throw new UnauthorizedException('Authenticated user id is missing.');
    }
    return id;
  }

  @Post('uploads/prepare')
  @RequirePermission('quality', 'manage')
  prepareUpload(@Body() body: any) {
    return this.evidence.prepareUpload({
      subjectType: String(body.subjectType ?? ''),
      subjectId: String(body.subjectId ?? ''),
      kind: String(body.kind ?? ''),
      originalFilename: body.originalFilename ?? null,
      mimeType: body.mimeType ?? null,
      byteSize: body.byteSize ?? null,
    });
  }

  @Post('uploads/finalize')
  @RequirePermission('quality', 'manage')
  finalizeUpload(@Body() body: any, @Req() req: { user?: { sub?: string } }) {
    return this.evidence.finalizeUpload(
      {
        subjectType: String(body.subjectType ?? ''),
        subjectId: String(body.subjectId ?? ''),
        kind: String(body.kind ?? ''),
        objectKey: String(body.objectKey ?? ''),
        originalFilename: body.originalFilename ?? null,
        note: body.note ?? null,
        capturedAt: body.capturedAt ?? null,
        sha256: body.sha256 ?? null,
      },
      this.userId(req),
    );
  }

  @Get(':id/download')
  @RequirePermission('quality', 'read')
  download(@Param('id') id: string) {
    return this.evidence.download(id);
  }

  @Post()
  @RequirePermission('quality', 'manage')
  add(@Body() body: any, @Req() req: { user?: { sub?: string } }) {
    return this.evidence.add(
      {
        subjectType: String(body.subjectType ?? ''),
        subjectId: String(body.subjectId ?? ''),
        kind: body.kind,
        objectKey: body.objectKey,
        originalFilename: body.originalFilename ?? null,
        mimeType: body.mimeType ?? null,
        byteSize: body.byteSize ?? null,
        sha256: body.sha256 ?? null,
        note: body.note ?? null,
        capturedAt: body.capturedAt ?? null,
      },
      this.userId(req),
    );
  }

  @Get()
  @RequirePermission('quality', 'read')
  list(
    @Query('subjectType') subjectType: string,
    @Query('subjectId') subjectId: string,
    @Query('limit') limit?: string,
  ) {
    return this.evidence.list(
      subjectType,
      subjectId,
      limit ? Number(limit) : undefined,
    );
  }
}
