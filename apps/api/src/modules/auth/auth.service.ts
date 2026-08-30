import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';

import { RedisService } from '../../infrastructure/redis/redis.service';

import { RegisterInput } from './dto/register.dto';
import { LoginInput } from './dto/login.dto';
import { CreateTenantUserInput } from './dto/create-tenant-user.dto';

const DEFAULT_OWNER_PERMISSIONS = [
  ['customers', 'read'],
  ['customers', 'create'],
  ['customers', 'update'],
  ['customers', 'delete'],
  ['appointments', 'read'],
  ['appointments', 'create'],
  ['appointments', 'update'],
  ['appointments', 'cancel'],
  ['payments', 'read'],
  ['payments', 'create'],
  ['payments', 'refund'],
  ['reports', 'read'],
  ['roles', 'read'],
  ['roles', 'update'],
  ['staff', 'read'],
  ['staff', 'create'],
  ['staff', 'update'],
  ['staff', 'delete'],
  ['services', 'read'],
  ['services', 'create'],
  ['services', 'update'],
  ['services', 'delete'],
] as const;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly redis: RedisService,
  ) {}

  async register(input: RegisterInput) {
    const email = input.email.trim().toLowerCase();
    const tenantSlug = input.tenantSlug.trim().toLowerCase();

    const [existingUser, existingTenant] = await Promise.all([
      this.prisma.user.findUnique({
        where: { email },
        select: { id: true },
      }),
      this.prisma.tenant.findUnique({
        where: { slug: tenantSlug },
        select: { id: true },
      }),
    ]);

    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    if (existingTenant) {
      throw new ConflictException('Tenant slug already exists');
    }

    const passwordHash = await argon2.hash(input.password);

    return this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: input.tenantName.trim(),
          slug: tenantSlug,
        },
      });

      const company = await tx.company.create({
        data: {
          tenantId: tenant.id,
          name: input.tenantName.trim(),
          slug: tenantSlug,
        },
      });

      const branch = await tx.branch.create({
        data: {
          companyId: company.id,
          name: 'Merkez',
          code: 'MERKEZ',
        },
      });

      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          firstName: input.firstName.trim(),
          lastName: input.lastName.trim(),
        },
      });

      const role = await tx.role.create({
        data: {
          tenantId: tenant.id,
          companyId: company.id,
          name: 'Owner',
          slug: 'owner',
          description: 'Full access to the company.',
          scope: 'CENTRAL',
        },
      });

      const membership = await tx.membership.create({
        data: {
          userId: user.id,
          tenantId: tenant.id,
          companyId: company.id,
          roleId: role.id,
        },
      });

      await tx.membershipBranchAccess.create({
        data: {
          membershipId: membership.id,
          branchId: branch.id,
        },
      });

      for (const [resource, action] of DEFAULT_OWNER_PERMISSIONS) {
        const permission = await tx.permission.upsert({
          where: {
            resource_action: {
              resource,
              action,
            },
          },
          update: {},
          create: {
            resource,
            action,
            description: resource + ' ' + action + ' permission',
          },
        });

        await tx.rolePermission.create({
          data: {
            roleId: role.id,
            permissionId: permission.id,
          },
        });
      }

      return {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
        },
        tenant: {
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
        },
        company: {
          id: company.id,
          name: company.name,
          slug: company.slug,
        },
        branch: {
          id: branch.id,
          name: branch.name,
          code: branch.code,
        },
        membership: {
          id: membership.id,
          role: role.slug,
          roleScope: role.scope,
          status: membership.status,
          permissions: DEFAULT_OWNER_PERMISSIONS.map(
            ([resource, action]) => `${resource}.${action}`,
          ),
        },
      };
    });
  }

  async createTenantUser(
    input: CreateTenantUserInput,
    tenantId: string,
    companyId: string,
    branchId: string | null,
  ) {
    const email = input.email.trim().toLowerCase();

    const existingUser = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    const role = await this.prisma.role.findFirst({
      where: {
        id: input.roleId,
        tenantId,
        OR: [
          { companyId: null },
          { companyId },
        ],
      },
      select: {
        id: true,
        name: true,
        slug: true,
        scope: true,
        companyId: true,
      },
    });

    if (!role) {
      throw new ConflictException(
        'Role does not belong to this company',
      );
    }

    if (role.scope === 'BRANCH' && !branchId) {
      throw new ConflictException(
        'A branch is required for a branch-scoped role',
      );
    }

    const passwordHash = await argon2.hash(input.password);

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          firstName: input.firstName.trim(),
          lastName: input.lastName.trim(),
        },
      });

      const membership = await tx.membership.create({
        data: {
          userId: user.id,
          tenantId,
          companyId,
          roleId: role.id,
        },
      });

      const branches = await tx.branch.findMany({
        where: {
          companyId,
          status: 'ACTIVE',
          ...(role.scope === 'BRANCH' && branchId
            ? { id: branchId }
            : {}),
        },
        select: {
          id: true,
        },
      });

      if (branches.length > 0) {
        await tx.membershipBranchAccess.createMany({
          data: branches.map((branch) => ({
            membershipId: membership.id,
            branchId: branch.id,
          })),
          skipDuplicates: true,
        });
      }

      return {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
        },
        membership: {
          id: membership.id,
          role: role.slug,
          roleName: role.name,
          roleScope: role.scope,
          status: membership.status,
        },
      };
    });
  }

  async resetDemoPassword(password: string) {
    const passwordHash = await argon2.hash(password);

    return this.prisma.user.update({
      where: {
        email: 'kaan.demo.2026@beautystudio.local',
      },
      data: {
        passwordHash,
      },
      select: {
        email: true,
      },
    });
  }

  async login(input: LoginInput) {
    const email = input.email.trim().toLowerCase();

    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        memberships: {
          where: {
            status: 'ACTIVE',
          },
          include: {
            tenant: true,
            company: true,
            branchAccesses: {
              include: {
                branch: true,
              },
              orderBy: {
                createdAt: 'asc',
              },
            },
            role: {
              include: {
                rolePermissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordValid = await argon2.verify(
      user.passwordHash,
      input.password,
    );

    if (!passwordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.memberships.length === 0) {
      throw new UnauthorizedException(
        'No active organization membership',
      );
    }

    const membership = user.memberships[0];

    if (!membership.company) {
      throw new UnauthorizedException(
        'Membership organization context is missing',
      );
    }

    const branchId =
      membership.role.scope === 'BRANCH'
        ? membership.branchAccesses[0]?.branchId ?? null
        : null;

    if (
      membership.role.scope === 'BRANCH' &&
      !branchId
    ) {
      throw new UnauthorizedException(
        'No active branch access is assigned',
      );
    }

    const accessToken = await this.createAccessToken(
      user.id,
      membership.tenantId,
      membership.company.id,
      branchId,
      membership.id,
      membership.roleId,
      membership.role.scope,
    );

    const refreshToken = await this.createRefreshSession(
      user.id,
      membership.tenantId,
      membership.company.id,
      branchId,
      membership.id,
      membership.roleId,
      membership.role.scope,
    );

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
      tenant: {
        id: membership.tenant.id,
        name: membership.tenant.name,
        slug: membership.tenant.slug,
      },
      company: {
        id: membership.company.id,
        name: membership.company.name,
        slug: membership.company.slug,
      },
      branch: branchId
        ? membership.branchAccesses.find(
            (access) => access.branchId === branchId,
          )?.branch ?? null
        : null,
      membership: {
        id: membership.id,
        role: membership.role.slug,
        roleScope: membership.role.scope,
        status: membership.status,
        permissions: membership.role.rolePermissions.map(
          (item) =>
            `${item.permission.resource}.${item.permission.action}`,
        ),
        branchIds: membership.branchAccesses.map(
          (access) => access.branchId,
        ),
      },
    };
  }

  async switchContext(
    membershipId: string,
    branchId: string | null,
    userId: string,
  ) {
    const membership = await this.prisma.membership.findFirst({
      where: {
        id: membershipId,
        userId,
        status: 'ACTIVE',
      },
      include: {
        tenant: true,
        company: true,
        role: true,
        branchAccesses: {
          include: { branch: true },
          orderBy: { createdAt: 'asc' },
        },
        user: true,
      },
    });

    if (!membership || !membership.company) {
      throw new UnauthorizedException('Membership is missing or inactive');
    }

    if (branchId === null) {
      if (membership.role.scope === 'BRANCH') {
        throw new UnauthorizedException('A branch is required for this role');
      }
    } else {
      const branch = await this.prisma.branch.findFirst({
        where: {
          id: branchId,
          companyId: membership.companyId ?? membership.company.id,
          status: 'ACTIVE',
        },
        select: { id: true, name: true, code: true },
      });

      if (!branch) {
        throw new UnauthorizedException('Branch does not belong to this company');
      }

      if (membership.role.scope !== 'CENTRAL') {
        const allowed = membership.branchAccesses.some(
          (access) => access.branchId === branchId,
        );

        if (!allowed) {
          throw new UnauthorizedException('You do not have access to this branch');
        }
      }
    }

    const companyId = membership.companyId ?? membership.company.id;

    const accessToken = await this.createAccessToken(
      membership.user.id,
      membership.tenantId,
      companyId,
      branchId,
      membership.id,
      membership.roleId,
      membership.role.scope,
    );

    const refreshToken = await this.createRefreshSession(
      membership.user.id,
      membership.tenantId,
      companyId,
      branchId,
      membership.id,
      membership.roleId,
      membership.role.scope,
    );

    return {
      accessToken,
      refreshToken,
      company: {
        id: membership.company.id,
        name: membership.company.name,
        slug: membership.company.slug,
      },
      branch: branchId
        ? membership.branchAccesses.find((access) => access.branchId === branchId)?.branch ??
          (await this.prisma.branch.findUnique({
            where: { id: branchId },
            select: { id: true, name: true, code: true, status: true },
          }))
        : null,
      membership: {
        id: membership.id,
        role: membership.role.slug,
        roleScope: membership.role.scope,
        status: membership.status,
        branchIds: membership.branchAccesses.map((access) => access.branchId),
      },
    };
  }

  async refresh(refreshToken: string) {
    if (!refreshToken || typeof refreshToken !== 'string') {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const key = `auth:refresh:${refreshToken}`;
    const sessionData = await this.redis.get(key);

    if (!sessionData) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    let session: {
      userId: string;
      tenantId: string;
      membershipId: string;
      roleId: string;
      companyId?: string;
      branchId?: string | null;
      roleScope?: 'CENTRAL' | 'COMPANY' | 'BRANCH';
    };

    try {
      session = JSON.parse(sessionData);
    } catch {
      await this.redis.delete(key);
      throw new UnauthorizedException('Invalid refresh session');
    }

    const membership = await this.prisma.membership.findUnique({
      where: {
        id: session.membershipId,
      },
      include: {
        tenant: true,
        company: true,
        role: true,
        branchAccesses: {
          include: {
            branch: true,
          },
          orderBy: {
            createdAt: 'asc',
          },
        },
        user: true,
      },
    });

    if (
      !membership ||
      membership.status !== 'ACTIVE' ||
      membership.userId !== session.userId ||
      membership.tenantId !== session.tenantId ||
      membership.roleId !== session.roleId ||
      !membership.company
    ) {
      await this.redis.delete(key);
      throw new UnauthorizedException('Invalid or inactive session');
    }

    const companyId =
      membership.companyId ?? session.companyId;

    if (!companyId) {
      await this.redis.delete(key);
      throw new UnauthorizedException(
        'Organization context is missing',
      );
    }

    const branchId =
      membership.role.scope === 'BRANCH'
        ? (
            session.branchId &&
            membership.branchAccesses.some(
              (access) => access.branchId === session.branchId,
            )
              ? session.branchId
              : membership.branchAccesses[0]?.branchId ?? null
          )
        : null;

    if (
      membership.role.scope === 'BRANCH' &&
      !branchId
    ) {
      await this.redis.delete(key);
      throw new UnauthorizedException(
        'No active branch access is assigned',
      );
    }

    const newAccessToken = await this.createAccessToken(
      membership.user.id,
      membership.tenantId,
      companyId,
      branchId,
      membership.id,
      membership.roleId,
      membership.role.scope,
    );

    const newRefreshToken = await this.createRefreshSession(
      membership.user.id,
      membership.tenantId,
      companyId,
      branchId,
      membership.id,
      membership.roleId,
      membership.role.scope,
    );

    await this.redis.delete(key);

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    };
  }

  async logout(refreshToken: string) {
    if (!refreshToken || typeof refreshToken !== 'string') {
      return {
        success: true,
      };
    }

    await this.redis.delete(`auth:refresh:${refreshToken}`);

    return {
      success: true,
    };
  }

  private async createAccessToken(
    userId: string,
    tenantId: string,
    companyId: string,
    branchId: string | null,
    membershipId: string,
    roleId: string,
    roleScope: 'CENTRAL' | 'COMPANY' | 'BRANCH',
  ): Promise<string> {
    return this.jwtService.signAsync({
      sub: userId,
      tenantId,
      companyId,
      branchId,
      membershipId,
      roleId,
      roleScope,
    });
  }

  private async createRefreshSession(
    userId: string,
    tenantId: string,
    companyId: string,
    branchId: string | null,
    membershipId: string,
    roleId: string,
    roleScope: 'CENTRAL' | 'COMPANY' | 'BRANCH',
  ): Promise<string> {
    const sessionId = randomUUID();

    const refreshSession = {
      userId,
      tenantId,
      companyId,
      branchId,
      membershipId,
      roleId,
      roleScope,
    };

    await this.redis.set(
      `auth:refresh:${sessionId}`,
      JSON.stringify(refreshSession),
      60 * 60 * 24 * 7,
    );

    return sessionId;
  }
}
