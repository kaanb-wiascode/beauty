import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';

import { SupplierInvitationService } from './supplier-invitation.service';
import {
  SupplierPortalAuthGuard,
  type SupplierPortalRequest,
} from './supplier-portal-auth.guard';
import { SupplierPortalRoleGuard } from './supplier-portal-role.guard';
import { SupplierPortalRoles } from './supplier-portal-roles.decorator';

const createInvitationSchema = z.object({
  email: z.string().email().max(320),
  role: z.enum(['OWNER', 'ADMIN', 'MEMBER']).default('MEMBER'),
  expiresInHours: z.number().int().min(1).max(168).optional(),
});

const acceptInvitationSchema = z.object({
  token: z.string().min(32).max(512),
  password: z.string().min(8).max(200),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
});

@Controller('supplier-portal/invitations')
export class SupplierInvitationController {
  constructor(private readonly invitations: SupplierInvitationService) {}

  @Post()
  @UseGuards(SupplierPortalAuthGuard, SupplierPortalRoleGuard)
  @SupplierPortalRoles('OWNER', 'ADMIN')
  async create(@Req() request: SupplierPortalRequest, @Body() body: unknown) {
    const principal = request.supplierPortalAuth;
    if (!principal) {
      throw new Error('Supplier portal principal missing after auth guard');
    }

    return this.invitations.createInvitation(
      principal,
      createInvitationSchema.parse(body),
    );
  }

  @Post('accept')
  async accept(@Body() body: unknown) {
    return this.invitations.acceptInvitation(
      acceptInvitationSchema.parse(body),
    );
  }
}
