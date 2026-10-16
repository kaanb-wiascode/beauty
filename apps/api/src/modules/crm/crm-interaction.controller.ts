import { Body, Controller, Get, Param, Post, Query, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { createCrmInteractionSchema, listCrmInteractionsSchema } from './crm-interaction.schemas';
import { CrmInteractionService } from './crm-interaction.service';

const uuid = z.string().uuid();

@Controller('crm/interactions')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
export class CrmInteractionController {
  constructor(private readonly interactions: CrmInteractionService) {}

  private userId(request: { user?: { sub?: string } }) {
    const id = request.user?.sub;
    if (!id) throw new UnauthorizedException('Oturum açmış kullanıcı bilgisi bulunamadı.');
    return id;
  }

  @Get()
  @RequirePermission('crm', 'read')
  list(@Query() query: unknown) {
    return this.interactions.list(listCrmInteractionsSchema.parse(query));
  }

  @Get(':id')
  @RequirePermission('crm', 'read')
  get(@Param('id') id: string) {
    return this.interactions.get(uuid.parse(id));
  }

  @Post()
  @RequirePermission('crm', 'manage')
  create(@Body() body: unknown, @Req() request: { user?: { sub?: string } }) {
    return this.interactions.create(createCrmInteractionSchema.parse(body), this.userId(request));
  }
}
