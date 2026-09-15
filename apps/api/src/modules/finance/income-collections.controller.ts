import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { JwtPayload } from '../../common/auth/jwt.strategy';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { IncomeCollectionsService } from './income-collections.service';

const collectionSchema = z.object({
  amount: z.coerce.number().positive(),
  collectionAccountId: z.string().uuid(),
  method: z.enum(['CASH', 'CARD', 'TRANSFER', 'OTHER']),
  reference: z.string().trim().max(150).optional(),
  note: z.string().trim().max(500).optional(),
  collectedAt: z.coerce.date().optional(),
  sourceType: z.string().trim().max(100).optional(),
  sourceId: z.string().trim().max(150).optional(),
});

const reversalSchema = z.object({
  reason: z.string().trim().min(1).max(500),
  sourceType: z.string().trim().max(100).optional(),
  sourceId: z.string().trim().max(150).optional(),
});

@Controller('finance/income')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
@RequirePermission('finance', 'read')
export class IncomeCollectionsController {
  constructor(private readonly service: IncomeCollectionsService) {}

  @Get(':id/collections')
  list(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.list(id);
  }

  @Post(':id/collections')
  @RequirePermission('finance', 'manage')
  record(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.record(id, collectionSchema.parse(body), user.sub);
  }

  @Post(':id/collections/:collectionId/reverse')
  @RequirePermission('finance', 'manage')
  reverse(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('collectionId', new ParseUUIDPipe()) collectionId: string,
    @Body() body: unknown,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.reverse(id, collectionId, reversalSchema.parse(body), user.sub);
  }
}
