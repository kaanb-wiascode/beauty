import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import {
  cancelWaitlistEntrySchema,
  createWaitlistEntrySchema,
  listWaitlistEntriesSchema,
} from './dto/waitlist.dto';
import { OperationsWaitlistService } from './operations-waitlist.service';

@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
@Controller('operations/waitlist')
export class OperationsWaitlistController {
  constructor(private readonly waitlist: OperationsWaitlistService) {}

  @Get()
  @RequirePermission('appointments', 'read')
  list(@Query() query: unknown) {
    return this.waitlist.list(listWaitlistEntriesSchema.parse(query));
  }

  @Post()
  @RequirePermission('appointments', 'update')
  create(@Body() body: unknown) {
    return this.waitlist.create(createWaitlistEntrySchema.parse(body));
  }

  @Post(':entryId/cancel')
  @RequirePermission('appointments', 'update')
  cancel(
    @Param('entryId', new ParseUUIDPipe()) entryId: string,
    @Body() body: unknown,
  ) {
    return this.waitlist.cancel(entryId, cancelWaitlistEntrySchema.parse(body));
  }
}
