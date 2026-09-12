import {
  Body,
  Controller,
  Get,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';

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
    private readonly prisma: PrismaService,
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
      this.tenantContext.getCompanyId(),
      this.tenantContext.getBranchId(),
    );
  }

  @Post('login')
  async login(@Body() body: unknown) {
    const input: LoginInput = loginSchema.parse(body);

    return this.authService.login(input);
  }

  @UseGuards(JwtAuthGuard, TenantAuthGuard)
  @Get('context/options')
  async contextOptions(@CurrentUser() user: JwtPayload) {
    const context = this.tenantContext.getContext();
    const membership = await this.prisma.membership.findFirst({
      where: {
        userId: user.sub,
        tenantId: context.tenantId,
        companyId: context.companyId,
        status: 'ACTIVE',
      },
      include: {
        role: true,
        branchAccesses: {
          include: { branch: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!membership) {
      throw new UnauthorizedException('Active organization membership is missing');
    }

    const branches =
      membership.role.scope === 'CENTRAL'
        ? await this.prisma.branch.findMany({
            where: {
              companyId: context.companyId,
              status: 'ACTIVE',
            },
            select: {
              id: true,
              name: true,
              code: true,
            },
            orderBy: [{ name: 'asc' }, { id: 'asc' }],
          })
        : membership.branchAccesses
            .filter((access) => access.branch.status === 'ACTIVE')
            .map((access) => ({
              id: access.branch.id,
              name: access.branch.name,
              code: access.branch.code,
            }));

    return {
      membershipId: membership.id,
      roleScope: membership.role.scope,
      activeBranchId: context.branchId,
      canViewAllBranches: membership.role.scope !== 'BRANCH',
      branches,
    };
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
      tenantContext: this.tenantContext.getContext(),
    };
  }
}
