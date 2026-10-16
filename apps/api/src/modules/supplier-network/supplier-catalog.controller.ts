import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PlatformAdminGuard } from '../../common/auth/platform-admin.guard';
import { SupplierCatalogService } from './supplier-catalog.service';

const uuid = z.string().uuid();
const brandSchema = z.object({ slug: z.string().min(1).max(100), name: z.string().min(1).max(160) });
const productSchema = z.object({
  brandId: z.string().uuid().optional(),
  slug: z.string().min(1).max(160),
  name: z.string().min(1).max(200),
  description: z.string().max(4000).optional(),
  categoryCode: z.string().max(100).optional(),
});
const variantSchema = z.object({
  name: z.string().min(1).max(200),
  canonicalSku: z.string().max(120).optional(),
  unit: z.enum(['UNIT','ML','LITER','GRAM','KG','METER','PAIR','BOX']).optional(),
  attributes: z.record(z.string(), z.unknown()).optional(),
});
const identifierSchema = z.object({
  type: z.enum(['GTIN','EAN','UPC','MPN','OTHER']),
  value: z.string().min(1).max(200),
});
const variantQuerySchema = z.object({ productId: z.string().uuid().optional() });

@Controller('platform/catalog')
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
export class SupplierCatalogController {
  constructor(private readonly catalog: SupplierCatalogService) {}

  @Get('brands') listBrands() { return this.catalog.listBrands(); }
  @Post('brands') createBrand(@Body() body: unknown) { return this.catalog.createBrand(brandSchema.parse(body)); }
  @Get('products') listProducts() { return this.catalog.listProducts(); }
  @Post('products') createProduct(@Body() body: unknown) { return this.catalog.createProduct(productSchema.parse(body)); }
  @Get('variants') listVariants(@Query() query: unknown) {
    const parsed = variantQuerySchema.parse(query);
    return this.catalog.listVariants(parsed.productId);
  }
  @Post('products/:id/variants') createVariant(@Param('id') id: string, @Body() body: unknown) {
    return this.catalog.createVariant(uuid.parse(id), variantSchema.parse(body));
  }
  @Post('variants/:id/identifiers') addIdentifier(@Param('id') id: string, @Body() body: unknown) {
    return this.catalog.addIdentifier(uuid.parse(id), identifierSchema.parse(body));
  }
}
