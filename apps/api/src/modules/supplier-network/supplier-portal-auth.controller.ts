import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';

import { SupplierPortalAuthGuard, type SupplierPortalRequest } from './supplier-portal-auth.guard';
import { SupplierPortalAuthService } from './supplier-portal-auth.service';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  supplierOrganizationId: z.string().uuid().optional(),
});

@Controller('supplier-portal/auth')
export class SupplierPortalAuthController {
  constructor(private readonly auth: SupplierPortalAuthService) {}

  @Post('login')
  async login(@Body() body: unknown) {
    return this.auth.login(loginSchema.parse(body));
  }

  @Get('me')
  @UseGuards(SupplierPortalAuthGuard)
  async me(@Req() request: SupplierPortalRequest) {
    return {
      authenticated: true,
      supplierPortal: request.supplierPortalAuth,
    };
  }
}
