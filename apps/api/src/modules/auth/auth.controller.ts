import {
  Body,
  Controller,
  Get,
  Post,
  UseGuards,
} from '@nestjs/common';

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
    private readonly tenantContext: TenantContext,
  ) {}

  @Post('register')
  async register(@Body() body: unknown) {
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
    );
  }

  @Post('login')
  async login(@Body() body: unknown) {
    const input: LoginInput = loginSchema.parse(body);

    return this.authService.login(input);
  }

  @Post('refresh')
  async refresh(@Body() body: { refreshToken: string }) {
    return this.authService.refresh(body.refreshToken);
  }

  @Post('logout')
  async logout(@Body() body: { refreshToken: string }) {
    return this.authService.logout(body.refreshToken);
  }

  @UseGuards(JwtAuthGuard, TenantAuthGuard)
  @Get('me')
  async me(@CurrentUser() user: JwtPayload) {
    return {
      authenticated: true,
      user,
      tenantContext: {
        tenantId: this.tenantContext.getTenantId(),
      },
    };
  }
}