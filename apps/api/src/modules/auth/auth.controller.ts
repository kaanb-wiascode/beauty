import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { z } from 'zod';

import { AuthService } from './auth.service';
import { AuthSessionRegistryService } from './auth-session-registry.service';
import { InvitationService } from './invitation.service';
import { MfaService } from './mfa.service';
import { SecurityPolicyService } from './security-policy.service';
import {
  AuthPublicRateLimit,
  AuthPublicRateLimitGuard,
} from './auth-public-rate-limit.guard';
import { loginSchema, LoginInput } from './dto/login.dto';
import { registerSchema, RegisterInput } from './dto/register.dto';
import { createTenantUserSchema } from './dto/create-tenant-user.dto';

import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { JwtPayload } from '../../common/auth/jwt.strategy';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';

import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { TenantContext } from '../../common/tenant/tenant-context';

const switchContextSchema = z.object({
  membershipId: z.string().uuid(),
  branchId: z.string().uuid().nullable(),
});

const refreshTokenSchema = z.object({
  refreshToken: z.string().uuid(),
});

const createInvitationSchema = z.object({
  email: z.string().trim().email().max(254),
  roleId: z.string().uuid(),
  branchIds: z.array(z.string().uuid()).max(200).default([]),
  expiresInHours: z.number().int().min(1).max(168).default(72),
});

const acceptInvitationSchema = z.object({
  token: z.string().trim().min(32).max(512),
  password: z.string().min(8).max(200),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
});

const securityPolicySchema = z.object({
  requireMfa: z.boolean(),
  sessionMaxAgeMinutes: z.number().int().min(15).max(43200),
  idleTimeoutMinutes: z.number().int().min(5).max(10080),
  passwordMinLength: z.number().int().min(8).max(128),
});

const mfaCodeSchema = z.object({ code: z.string().trim().regex(/^\d{6}$/) });
const mfaChallengeSchema = z.object({
  challengeId: z.string().uuid(),
  code: z.string().trim().regex(/^\d{6}$/),
});

@Controller('auth')
@UseGuards(AuthPublicRateLimitGuard)
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly sessionRegistry: AuthSessionRegistryService,
    private readonly invitationService: InvitationService,
    private readonly mfaService: MfaService,
    private readonly securityPolicyService: SecurityPolicyService,
    private readonly tenantContext: TenantContext,
    private readonly prisma: PrismaService,
  ) {}

  @Post('register')
  @AuthPublicRateLimit('register', 5, 600)
  async register(@Body() body: unknown) {
    const input: RegisterInput = registerSchema.parse(body);
    return this.authService.register(input);
  }

  @UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
  @RequirePermission('roles', 'update')
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

  @UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
  @RequirePermission('roles', 'update')
  @Post('invitations')
  async createInvitation(@Body() body: unknown) {
    const input = createInvitationSchema.parse(body);
    const context = this.tenantContext.getContext();
    return this.invitationService.create(input, {
      tenantId: context.tenantId,
      companyId: context.companyId,
      actorMembershipId: context.membershipId,
    });
  }

  @UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
  @RequirePermission('roles', 'read')
  @Get('invitations')
  async invitations() {
    return this.invitationService.list(
      this.tenantContext.getTenantId(),
      this.tenantContext.getCompanyId(),
    );
  }

  @UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
  @RequirePermission('roles', 'update')
  @Post('invitations/:id/revoke')
  async revokeInvitation(@Param('id') id: string) {
    const context = this.tenantContext.getContext();
    return this.invitationService.revoke(id, {
      tenantId: context.tenantId,
      companyId: context.companyId,
      actorMembershipId: context.membershipId,
    });
  }

  @Post('invitations/accept')
  @AuthPublicRateLimit('invitation-accept', 10, 300)
  async acceptInvitation(@Body() body: unknown) {
    return this.invitationService.accept(acceptInvitationSchema.parse(body));
  }

  @Post('login')
  @AuthPublicRateLimit('login', 12, 60)
  async login(@Body() body: unknown) {
    const input: LoginInput = loginSchema.parse(body);
    const result = await this.authService.login(input);
    const policy = await this.securityPolicyService.get(result.tenant.id, result.company.id);

    if (policy.requireMfa === true) {
      return this.mfaService.beginLoginChallenge(result);
    }

    await this.registerSession(result);
    return result;
  }

  @Post('mfa/verify')
  @AuthPublicRateLimit('mfa-verify', 10, 300)
  async verifyMfa(@Body() body: unknown) {
    const input = mfaChallengeSchema.parse(body);
    const result = await this.mfaService.verifyLoginChallenge(input.challengeId, input.code);
    await this.registerSession(result);
    return result;
  }

  @Post('mfa/challenge/:id/setup')
  @AuthPublicRateLimit('mfa-setup', 5, 300)
  async setupMfaChallenge(@Param('id') id: string) {
    return this.mfaService.setupLoginChallenge(id);
  }

  @Post('mfa/challenge/:id/enroll')
  @AuthPublicRateLimit('mfa-enroll', 10, 300)
  async enrollMfaChallenge(@Param('id') id: string, @Body() body: unknown) {
    const { code } = mfaCodeSchema.parse(body);
    const result = await this.mfaService.completeEnrollmentChallenge(id, code);
    await this.registerSession(result);
    return result;
  }

  @UseGuards(JwtAuthGuard, TenantAuthGuard)
  @Get('mfa/status')
  async mfaStatus(@CurrentUser() user: JwtPayload) {
    return this.mfaService.status(user.sub);
  }

  @UseGuards(JwtAuthGuard, TenantAuthGuard)
  @Post('mfa/setup')
  async setupMfa(@CurrentUser() user: JwtPayload) {
    const account = await this.prisma.user.findUnique({
      where: { id: user.sub },
      select: { email: true },
    });
    if (!account) throw new UnauthorizedException('User account is missing');
    return this.mfaService.setup(user.sub, account.email);
  }

  @UseGuards(JwtAuthGuard, TenantAuthGuard)
  @Post('mfa/confirm')
  async confirmMfa(@CurrentUser() user: JwtPayload, @Body() body: unknown) {
    const { code } = mfaCodeSchema.parse(body);
    return this.mfaService.confirm(user.sub, code, this.tenantContext.getTenantId());
  }

  @UseGuards(JwtAuthGuard, TenantAuthGuard)
  @Get('sessions')
  async sessions(@CurrentUser() user: JwtPayload) {
    return this.sessionRegistry.list(user.sub, this.tenantContext.getTenantId());
  }

  @UseGuards(JwtAuthGuard, TenantAuthGuard)
  @Post('sessions/:id/revoke')
  async revokeSession(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.sessionRegistry.revoke(id, user.sub, this.tenantContext.getTenantId());
  }

  @UseGuards(JwtAuthGuard, TenantAuthGuard)
  @Post('sessions/revoke-all')
  async revokeAllSessions(@CurrentUser() user: JwtPayload) {
    return this.sessionRegistry.revokeAll({
      actorUserId: user.sub,
      targetUserId: user.sub,
      tenantId: this.tenantContext.getTenantId(),
      action: 'revoke_all',
    });
  }

  @UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
  @RequirePermission('roles', 'read')
  @Get('admin/users/:userId/sessions')
  async adminUserSessions(@Param('userId') userId: string) {
    const context = this.tenantContext.getContext();
    await this.requireCompanyUser(userId, context.tenantId, context.companyId);
    return this.sessionRegistry.listForCompany(userId, context.tenantId, context.companyId);
  }

  @UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
  @RequirePermission('roles', 'update')
  @Post('admin/users/:userId/sessions/:id/revoke')
  async adminRevokeUserSession(
    @CurrentUser() actor: JwtPayload,
    @Param('userId') userId: string,
    @Param('id') id: string,
  ) {
    const context = this.tenantContext.getContext();
    await this.requireCompanyUser(userId, context.tenantId, context.companyId);
    return this.sessionRegistry.revokeForAdmin({
      id,
      actorUserId: actor.sub,
      targetUserId: userId,
      tenantId: context.tenantId,
      companyId: context.companyId,
    });
  }

  @UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
  @RequirePermission('roles', 'update')
  @Post('admin/users/:userId/sessions/revoke-all')
  async adminRevokeAllUserSessions(
    @CurrentUser() actor: JwtPayload,
    @Param('userId') userId: string,
  ) {
    const context = this.tenantContext.getContext();
    await this.requireCompanyUser(userId, context.tenantId, context.companyId);
    return this.sessionRegistry.revokeAll({
      actorUserId: actor.sub,
      targetUserId: userId,
      tenantId: context.tenantId,
      companyId: context.companyId,
      action: 'admin_revoke_all',
    });
  }

  @UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
  @RequirePermission('roles', 'read')
  @Get('security-policy')
  async securityPolicy() {
    const context = this.tenantContext.getContext();
    return this.securityPolicyService.get(context.tenantId, context.companyId);
  }

  @UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
  @RequirePermission('roles', 'update')
  @Post('security-policy')
  async updateSecurityPolicy(
    @CurrentUser() actor: JwtPayload,
    @Body() body: unknown,
  ) {
    const context = this.tenantContext.getContext();
    return this.securityPolicyService.update(securityPolicySchema.parse(body), {
      tenantId: context.tenantId,
      companyId: context.companyId,
      actorUserId: actor.sub,
    });
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
            where: { companyId: context.companyId, status: 'ACTIVE' },
            select: { id: true, name: true, code: true },
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
    @Body() body: unknown,
  ) {
    const input = switchContextSchema.parse(body);
    const result = await this.authService.switchContext(input.membershipId, input.branchId, user.sub);
    await this.registerSession(result);
    return result;
  }

  @Post('refresh')
  @AuthPublicRateLimit('refresh', 30, 60)
  async refresh(@Body() body: unknown) {
    const input = refreshTokenSchema.parse(body);
    const result = await this.authService.refresh(input.refreshToken);
    await this.sessionRegistry.rotate(input.refreshToken, result.refreshToken);
    return result;
  }

  @Post('logout')
  async logout(@Body() body: unknown) {
    const input = refreshTokenSchema.parse(body);
    await this.sessionRegistry.unregister(input.refreshToken);
    return this.authService.logout(input.refreshToken);
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

  private async registerSession(result: {
    refreshToken: string;
    user: { id: string };
    tenant: { id: string };
    company: { id: string };
    branch: { id: string } | null;
    membership: { id: string; roleScope: string };
  }) {
    await this.sessionRegistry.register({
      refreshId: result.refreshToken,
      userId: result.user.id,
      tenantId: result.tenant.id,
      membershipId: result.membership.id,
      companyId: result.company.id,
      branchId: result.branch?.id ?? null,
      roleScope: result.membership.roleScope,
    });
  }

  private async requireCompanyUser(userId: string, tenantId: string, companyId: string) {
    const membership = await this.prisma.membership.findFirst({
      where: { userId, tenantId, companyId },
      select: { id: true },
    });
    if (!membership) {
      throw new UnauthorizedException('User is not in the active company');
    }
    return membership;
  }
}
