import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';

import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import type { JwtPayload } from '../../common/auth/jwt.strategy';
import { PlatformAdminGuard } from '../../common/auth/platform-admin.guard';
import { SupplierMembershipService } from './supplier-membership.service';

const organizationIdSchema = z.string().uuid();
const membershipSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(['OWNER', 'ADMIN', 'MEMBER']).default('MEMBER'),
});

@Controller('platform/supplier-network')
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
export class SupplierMembershipController {
  constructor(private readonly memberships: SupplierMembershipService) {}

  @Get('organizations/:organizationId/memberships')
  async listMemberships(@Param('organizationId') organizationId: string) {
    return this.memberships.listMemberships(
      organizationIdSchema.parse(organizationId),
    );
  }

  @Post('organizations/:organizationId/memberships')
  async upsertMembership(
    @Param('organizationId') organizationId: string,
    @Body() body: unknown,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.memberships.upsertMembership(
      organizationIdSchema.parse(organizationId),
      membershipSchema.parse(body),
      user.sub,
    );
  }
}
