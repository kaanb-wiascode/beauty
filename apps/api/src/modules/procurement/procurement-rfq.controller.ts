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
import { ProcurementRfqCommercialTermsService } from './procurement-rfq-commercial-terms.service';
import { ProcurementRfqOptionsService } from './procurement-rfq-options.service';
import { ProcurementRfqService } from './procurement-rfq.service';

const uuid = z.string().uuid();
const listSchema = z.object({
  status: z
    .enum(['DRAFT', 'PUBLISHED', 'CLOSED', 'AWARDED', 'CANCELLED'])
    .optional(),
});
const createSchema = z.object({
  warehouseId: uuid,
  title: z.string().trim().min(1).max(200),
  note: z.string().trim().max(2000).optional(),
  responseDeadline: z.coerce.date().optional(),
  items: z
    .array(
      z.object({
        inventoryProductId: uuid,
        catalogVariantId: uuid,
        quantity: z.coerce.number().positive(),
        note: z.string().trim().max(500).optional(),
      }),
    )
    .min(1),
  supplierConnectionIds: z.array(uuid).min(1),
});

@Controller('procurement/rfqs')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
@RequirePermission('inventory', 'read')
export class ProcurementRfqController {
  constructor(
    private readonly rfqs: ProcurementRfqService,
    private readonly options: ProcurementRfqOptionsService,
    private readonly commercialTerms: ProcurementRfqCommercialTermsService,
  ) {}

  private userId(req: { user?: { sub?: string } }) {
    const userId = req.user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Authenticated user id is missing.');
    }
    return userId;
  }

  @Get()
  list(@Query() query: unknown) {
    const parsed = listSchema.parse(query);
    return this.rfqs.list(parsed.status);
  }

  @Get('options')
  getOptions() {
    return this.options.get();
  }

  @Get(':id/commercial-terms')
  getCommercialTerms(@Param('id') id: string) {
    return this.commercialTerms.list(uuid.parse(id));
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.rfqs.get(uuid.parse(id));
  }

  @Post()
  @RequirePermission('inventory', 'write')
  create(
    @Body() body: unknown,
    @Req() req: { user?: { sub?: string } },
  ) {
    return this.rfqs.create(createSchema.parse(body), this.userId(req));
  }

  @Post(':id/publish')
  @RequirePermission('inventory', 'write')
  publish(
    @Param('id') id: string,
    @Req() req: { user?: { sub?: string } },
  ) {
    return this.rfqs.publish(uuid.parse(id), this.userId(req));
  }

  @Post(':id/close')
  @RequirePermission('inventory', 'write')
  close(
    @Param('id') id: string,
    @Req() req: { user?: { sub?: string } },
  ) {
    return this.rfqs.close(uuid.parse(id), this.userId(req));
  }

  @Post(':id/cancel')
  @RequirePermission('inventory', 'write')
  cancel(
    @Param('id') id: string,
    @Req() req: { user?: { sub?: string } },
  ) {
    return this.rfqs.cancel(uuid.parse(id), this.userId(req));
  }

  @Post(':id/quotes/:quoteId/award')
  @RequirePermission('inventory', 'write')
  award(
    @Param('id') id: string,
    @Param('quoteId') quoteId: string,
    @Req() req: { user?: { sub?: string } },
  ) {
    return this.rfqs.award(
      uuid.parse(id),
      uuid.parse(quoteId),
      this.userId(req),
    );
  }
}
