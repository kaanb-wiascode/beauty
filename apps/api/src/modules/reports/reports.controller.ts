import {
  Body,
  Controller,
  Delete,
  Get,
  InternalServerErrorException,
  Optional,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';

import type { JwtPayload } from '../../common/auth/jwt.strategy';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { reportExportSchema } from './dto/report-export.dto';
import { reportExportListSchema } from './dto/report-export-list.dto';
import { reportPreviewSchema } from './dto/report-preview.dto';
import {
  createReportSavedViewSchema,
  updateReportSavedViewSchema,
} from './dto/report-saved-view.dto';
import { ReportExportDownloadService } from './report-export-download.service';
import { ReportExportPolicyService } from './report-export-policy.service';
import {
  toPublicReportExportJob,
  toPublicReportExportList,
} from './report-export.presenter';
import { ReportSavedViewsService } from './report-saved-views.service';
import { ReportsService } from './reports.service';

@Controller('reports')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly exportDownloads: ReportExportDownloadService,
    @Optional() private readonly exportPolicy?: ReportExportPolicyService,
    @Optional() private readonly savedViews?: ReportSavedViewsService,
  ) {}

  @Get('catalog')
  @RequirePermission('reports', 'read')
  getCatalog(@Req() request: { user: JwtPayload }) {
    return this.reportsService.getCatalog(request.user);
  }

  @Post('preview')
  @RequirePermission('reports', 'read')
  preview(
    @Req() request: { user: JwtPayload },
    @Body() body: unknown,
  ) {
    const input = reportPreviewSchema.parse(body);
    return this.reportsService.preview(request.user, input);
  }

  @Post('saved-reports')
  @RequirePermission('reports', 'read')
  createSavedReport(
    @Req() request: { user: JwtPayload },
    @Body() body: unknown,
  ) {
    const input = createReportSavedViewSchema.parse(body);
    return this.requireSavedViews().create(request.user, input);
  }

  @Get('saved-reports')
  @RequirePermission('reports', 'read')
  listSavedReports(@Req() request: { user: JwtPayload }) {
    return this.requireSavedViews().list(request.user);
  }

  @Get('saved-reports/:id')
  @RequirePermission('reports', 'read')
  getSavedReport(
    @Req() request: { user: JwtPayload },
    @Param('id') id: string,
  ) {
    return this.requireSavedViews().get(request.user, id);
  }

  @Patch('saved-reports/:id')
  @RequirePermission('reports', 'read')
  updateSavedReport(
    @Req() request: { user: JwtPayload },
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = updateReportSavedViewSchema.parse(body);
    return this.requireSavedViews().update(request.user, id, input);
  }

  @Delete('saved-reports/:id')
  @RequirePermission('reports', 'read')
  deleteSavedReport(
    @Req() request: { user: JwtPayload },
    @Param('id') id: string,
  ) {
    return this.requireSavedViews().delete(request.user, id);
  }

  @Post('exports')
  @RequirePermission('reports', 'read')
  async createExport(
    @Req() request: { user: JwtPayload },
    @Body() body: unknown,
  ) {
    const input = reportExportSchema.parse(body);
    await this.exportPolicy?.assertCanQueue(request.user);
    const job = await this.reportsService.createExportJob(request.user, input);
    if (!job) {
      throw new InternalServerErrorException('Report export job was not created');
    }
    return toPublicReportExportJob(job);
  }

  @Get('exports')
  @RequirePermission('reports', 'read')
  async listExports(
    @Req() request: { user: JwtPayload },
    @Query() query: unknown,
  ) {
    const input = reportExportListSchema.parse(query);
    const result = await this.reportsService.listExportJobs(request.user, input);
    return toPublicReportExportList(result);
  }

  @Get('exports/:id/download')
  @RequirePermission('reports', 'read')
  async downloadExport(
    @Req() request: { user: JwtPayload },
    @Param('id') id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const artifact = await this.exportDownloads.download(request.user, id);
    response.setHeader('Content-Type', artifact.contentType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(artifact.fileName)}`,
    );
    response.setHeader('Cache-Control', 'private, no-store');
    return new StreamableFile(artifact.content);
  }

  @Get('exports/:id')
  @RequirePermission('reports', 'read')
  async getExport(
    @Req() request: { user: JwtPayload },
    @Param('id') id: string,
  ) {
    const job = await this.reportsService.getExportJob(request.user, id);
    return toPublicReportExportJob(job);
  }

  private requireSavedViews() {
    if (!this.savedViews) {
      throw new InternalServerErrorException('Saved report service unavailable');
    }
    return this.savedViews;
  }
}
