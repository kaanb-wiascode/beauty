import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import type { JwtPayload } from '../../common/auth/jwt.strategy';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { reportExportSchema } from './dto/report-export.dto';
import { reportExportListSchema } from './dto/report-export-list.dto';
import { reportPreviewSchema } from './dto/report-preview.dto';
import { ReportsService } from './reports.service';

@Controller('reports')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

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

  @Post('exports')
  @RequirePermission('reports', 'read')
  createExport(
    @Req() request: { user: JwtPayload },
    @Body() body: unknown,
  ) {
    const input = reportExportSchema.parse(body);
    return this.reportsService.createExportJob(request.user, input);
  }

  @Get('exports')
  @RequirePermission('reports', 'read')
  listExports(
    @Req() request: { user: JwtPayload },
    @Query() query: unknown,
  ) {
    const input = reportExportListSchema.parse(query);
    return this.reportsService.listExportJobs(request.user, input);
  }

  @Get('exports/:id')
  @RequirePermission('reports', 'read')
  getExport(
    @Req() request: { user: JwtPayload },
    @Param('id') id: string,
  ) {
    return this.reportsService.getExportJob(request.user, id);
  }
}
