import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { PackagesService } from './packages.service';

const packageItemSchema = z.object({
  serviceId: z.string().uuid(),
  quantity: z.coerce.number().int().positive(),
});

const createPackageSchema = z.object({
  name: z.string().trim().min(1).max(150),
  description: z.string().trim().max(1000).optional(),
  price: z.coerce.number().min(0),
  validityDays: z.coerce.number().int().positive().optional(),
  items: z.array(packageItemSchema).min(1),
});

const updatePackageSchema = createPackageSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  'At least one field is required.',
);

@Controller('packages')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
@RequirePermission('services', 'read')
export class PackagesController {
  constructor(private readonly packagesService: PackagesService) {}

  @Post()
  @RequirePermission('services', 'create')
  create(@Body() body: unknown) {
    return this.packagesService.create(createPackageSchema.parse(body));
  }

  @Get()
  findAll() {
    return this.packagesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.packagesService.findOne(id);
  }

  @Patch(':id')
  @RequirePermission('services', 'update')
  update(@Param('id') id: string, @Body() body: unknown) {
    return this.packagesService.update(id, updatePackageSchema.parse(body));
  }

  @Post(':id/archive')
  @RequirePermission('services', 'update')
  archive(@Param('id') id: string) {
    return this.packagesService.archive(id);
  }
}
