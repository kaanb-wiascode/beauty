import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

import { AuthRateLimitService } from './auth-rate-limit.service';
import { AuthService } from './auth.service';
import { loginSchema, LoginInput } from './dto/login.dto';
import { registerSchema, RegisterInput } from './dto/register.dto';
import { createTenantUserSchema } from './dto/create-tenant-user.dto';

import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { JwtPayload } from '../../common/auth/jwt.strategy';

import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { TenantContext } from '../../common/tenant/tenant-context';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly authRateLimit: AuthRateLimitService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Post('register')
  async register(@Req() request: Request, @Body() body: unknown) {
    await this.authRateLimit.assertAllowed(
      'register',
      request.ip ?? request.socket.remoteAddress ?? 'unknown',
      5,
      15 * 60,
    );

    const input: RegisterInput = registerSchema.parse(body);

    return this.authService.register(input);
  }

  @UseGuards(JwtAuthGuard, TenantAuthGuard)
  @Post('users')
  async createUser(@Body() body: unknown) {
    const input = createTenantUserSchema.parse(body);

    return this.authService.createTenantUser(
      input,
      this.tenantContext.getTenantId(),
      this.tenantContext.getCompanyId(),
      this.tenantContext.getBranchId(),
    );
  }

  @Post('login')
  async login(@Req() request: Request, @Body() body: unknown) {
    await this.authRateLimit.assertAllowed(
      'login',
      request.ip ?? request.socket.remoteAddress ?? 'unknown',
      10,
      60,
    );

    const input: LoginInput = loginSchema.parse(body);

    return this.authService.login(input);
  }

  @UseGuards(JwtAuthGuard)
  @Post('context/switch')
  async switchContext(
    @CurrentUser() user: JwtPayload,
    @Body() body: { membershipId: string; branchId: string | null },
  ) {
    return this.authService.switchContext(
      body.membershipId,
      body.branchId ?? null,
      user.sub,
    );
  }

  @Post('refresh')
  async refresh(
    @Req() request: Request,
    @Body() body: { refreshToken: string },
  ) {
    await this.authRateLimit.assertAllowed(
      'refresh',
      request.ip ?? request.socket.remoteAddress ?? 'unknown',
      20,
      60,
    );

    return this.authService.refresh(body.refreshToken);
  }

  @Post('logout')
  async logout(@Body() body: { refreshToken: string }) {
    return this.authService.logout(body.refreshToken);
  }

  @UseGuards(JwtAuthGuard, TenantAuthGuard)
  @Get('me')
  me(@CurrentUser() user: JwtPayload) {
    return {
      authenticated: true,
      user,
      tenantContext: this.tenantContext.getContext(),
    };
  }
}
