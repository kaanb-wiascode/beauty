import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
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
@UseGuards(JwtAuthGuard, TenantAuthGuard)
export class PackagesController {
  constructor(private readonly packagesService: PackagesService) {}

  @Post()
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
  update(@Param('id') id: string, @Body() body: unknown) {
    return this.packagesService.update(id, updatePackageSchema.parse(body));
  }

  @Post(':id/archive')
  archive(@Param('id') id: string) {
    return this.packagesService.archive(id);
  }
}
