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
import { z } from 'zod';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { QualityEvidenceService } from './quality-evidence.service';

const subjectTypeSchema = z.enum([
  'INSPECTION',
  'INSPECTION_RESULT',
  'FINDING',
  'QUALITY_CASE',
  'CAPA',
]);
const evidenceKindSchema = z.enum(['PHOTO', 'DOCUMENT', 'OTHER']);
const optionalFilenameSchema = z.string().trim().max(255).nullable().optional();
const optionalMimeSchema = z.string().trim().max(255).nullable().optional();
const optionalShaSchema = z
  .string()
  .trim()
  .regex(/^[0-9a-fA-F]{64}$/)
  .nullable()
  .optional();

const prepareUploadSchema = z.object({
  subjectType: subjectTypeSchema,
  subjectId: z.string().uuid(),
  kind: evidenceKindSchema,
  originalFilename: optionalFilenameSchema,
  mimeType: optionalMimeSchema,
  byteSize: z.coerce.number().int().min(0).nullable().optional(),
});

const finalizeUploadSchema = z.object({
  subjectType: subjectTypeSchema,
  subjectId: z.string().uuid(),
  kind: evidenceKindSchema,
  objectKey: z.string().trim().min(1).max(2000),
  originalFilename: optionalFilenameSchema,
  note: z.string().trim().max(4000).nullable().optional(),
  capturedAt: z.coerce.date().nullable().optional(),
  sha256: optionalShaSchema,
});

const addEvidenceSchema = z.object({
  subjectType: subjectTypeSchema,
  subjectId: z.string().uuid(),
  kind: evidenceKindSchema,
  objectKey: z.string().trim().min(1).max(2000),
  originalFilename: optionalFilenameSchema,
  mimeType: optionalMimeSchema,
  byteSize: z.coerce.number().int().min(0).nullable().optional(),
  sha256: optionalShaSchema,
  note: z.string().trim().max(4000).nullable().optional(),
  capturedAt: z.coerce.date().nullable().optional(),
});

const evidenceListSchema = z.object({
  subjectType: subjectTypeSchema,
  subjectId: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

const idSchema = z.string().uuid();

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
  prepareUpload(@Body() body: unknown) {
    return this.evidence.prepareUpload(prepareUploadSchema.parse(body));
  }

  @Post('uploads/finalize')
  @RequirePermission('quality', 'manage')
  finalizeUpload(
    @Body() body: unknown,
    @Req() req: { user?: { sub?: string } },
  ) {
    const input = finalizeUploadSchema.parse(body);
    return this.evidence.finalizeUpload(
      {
        ...input,
        capturedAt: input.capturedAt?.toISOString() ?? null,
      },
      this.userId(req),
    );
  }

  @Get(':id/download')
  @RequirePermission('quality', 'read')
  download(@Param('id') id: string) {
    return this.evidence.download(idSchema.parse(id));
  }

  @Post()
  @RequirePermission('quality', 'manage')
  add(
    @Body() body: unknown,
    @Req() req: { user?: { sub?: string } },
  ) {
    const input = addEvidenceSchema.parse(body);
    return this.evidence.add(
      {
        ...input,
        capturedAt: input.capturedAt?.toISOString() ?? null,
      },
      this.userId(req),
    );
  }

  @Get()
  @RequirePermission('quality', 'read')
  list(@Query() query: unknown) {
    const input = evidenceListSchema.parse(query);
    return this.evidence.list(
      input.subjectType,
      input.subjectId,
      input.limit,
    );
  }
}
