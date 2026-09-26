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
  cancelResourceBlockSchema,
  createResourceBlockSchema,
  listResourceBlocksQuerySchema,
} from './dto/operations-resource.dto';
import { OperationsResourceBlocksService } from './operations-resource-blocks.service';

@UseGuards(JwtAuthGuard, TenantAuthGuard)
@Controller('operations/resource-blocks')
export class OperationsResourceBlocksController {
  constructor(private readonly blocks: OperationsResourceBlocksService) {}

  @Get()
  @UseGuards(PermissionsGuard)
  @RequirePermission('appointments', 'read')
  list(@Query() query: Record<string, unknown>) {
    return this.blocks.list(listResourceBlocksQuerySchema.parse(query));
  }

  @Post()
  @UseGuards(PermissionsGuard)
  @RequirePermission('appointments', 'update')
  create(@Body() body: unknown) {
    return this.blocks.create(createResourceBlockSchema.parse(body));
  }

  @Post(':blockId/cancel')
  @UseGuards(PermissionsGuard)
  @RequirePermission('appointments', 'update')
  cancel(
    @Param('blockId', new ParseUUIDPipe()) blockId: string,
    @Body() body: unknown,
  ) {
    return this.blocks.cancel(blockId, cancelResourceBlockSchema.parse(body));
  }
}
