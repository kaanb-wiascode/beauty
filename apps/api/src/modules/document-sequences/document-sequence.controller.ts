import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { DocumentSequenceService } from './document-sequence.service';

@Controller('admin/document-sequences')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
export class DocumentSequenceController {
  constructor(private readonly sequences: DocumentSequenceService) {}

  @Get()
  @RequirePermission('roles', 'read')
  list() {
    return this.sequences.list();
  }

  @Put()
  @RequirePermission('roles', 'update')
  upsert(@Body() body: {
    documentType?: string;
    prefix?: string;
    branchId?: string | null;
    yearScoped?: boolean;
    padding?: number;
    active?: boolean;
  }) {
    return this.sequences.upsert({
      documentType: body.documentType ?? '',
      prefix: body.prefix ?? '',
      branchId: body.branchId ?? null,
      yearScoped: body.yearScoped,
      padding: body.padding,
      active: body.active,
    });
  }
}
