import { Body, Controller, Get, Param, Patch, Post, Query, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { createCrmQuoteSchema, updateCrmQuoteStatusSchema } from './crm-quote.schemas';
import { CrmQuoteService } from './crm-quote.service';

const uuid = z.string().uuid();
const sendQuoteSchema = z.object({ channel: z.enum(['EMAIL','SMS','WHATSAPP']) });

@Controller('crm/quotes')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
export class CrmQuoteController {
  constructor(private readonly quotes: CrmQuoteService) {}

  private userId(request: { user?: { sub?: string } }) {
    const id = request.user?.sub;
    if (!id) throw new UnauthorizedException('Oturum açmış kullanıcı bilgisi bulunamadı.');
    return id;
  }

  @Get()
  @RequirePermission('crm', 'read')
  list(@Query('opportunityId') opportunityId?: string) {
    return this.quotes.list(opportunityId ? uuid.parse(opportunityId) : undefined);
  }

  @Get(':id')
  @RequirePermission('crm', 'read')
  get(@Param('id') id: string) {
    return this.quotes.get(uuid.parse(id));
  }

  @Post()
  @RequirePermission('crm', 'manage')
  create(@Body() body: unknown, @Req() request: { user?: { sub?: string } }) {
    return this.quotes.create(createCrmQuoteSchema.parse(body), this.userId(request));
  }

  @Post(':id/send')
  @RequirePermission('crm', 'manage')
  send(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: { user?: { sub?: string } },
  ) {
    const input = sendQuoteSchema.parse(body);
    return this.quotes.sendQuote(uuid.parse(id), input.channel, this.userId(request));
  }

  @Post(':id/convert-sale')
  @RequirePermission('payments', 'create')
  convertToSale(@Param('id') id: string, @Req() request: { user?: { sub?: string } }) {
    return this.quotes.convertToSale(uuid.parse(id), this.userId(request));
  }

  @Patch(':id/status')
  @RequirePermission('crm', 'manage')
  updateStatus(@Param('id') id: string, @Body() body: unknown, @Req() request: { user?: { sub?: string } }) {
    return this.quotes.updateStatus(uuid.parse(id), updateCrmQuoteStatusSchema.parse(body), this.userId(request));
  }
}
