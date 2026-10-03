import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { z } from 'zod';

import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { OrganizationAdminService } from './organization-admin.service';

const companyUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(160).optional(),
    status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'At least one company field is required');

const branchUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(160).optional(),
    code: z.string().trim().min(1).max(40).optional(),
    status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']).optional(),
    address: z.string().trim().max(500).nullable().optional(),
    phone: z.string().trim().max(40).nullable().optional(),
    email: z.string().trim().email().max(254).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'At least one branch field is required');

@Controller('admin/organization')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
export class OrganizationAdminController {
  constructor(
    private readonly organizationAdmin: OrganizationAdminService,
  ) {}

  @Get('company')
  @RequirePermission('roles', 'read')
  async company() {
    return this.organizationAdmin.currentCompany();
  }

  @Patch('company')
  @RequirePermission('roles', 'update')
  async updateCompany(@Body() body: unknown) {
    return this.organizationAdmin.updateCurrentCompany(
      companyUpdateSchema.parse(body),
    );
  }

  @Get('branches')
  @RequirePermission('roles', 'read')
  async branches() {
    return this.organizationAdmin.accessibleBranches();
  }

  @Patch('branches/:id')
  @RequirePermission('roles', 'update')
  async updateBranch(
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.organizationAdmin.updateBranch(
      id,
      branchUpdateSchema.parse(body),
    );
  }
}
