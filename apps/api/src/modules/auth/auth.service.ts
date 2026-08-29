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
          name: 'Owner',
          slug: 'owner',
          description: 'Full access to the tenant.',
        },
      });

      const membership = await tx.membership.create({
        data: {
          userId: user.id,
          tenantId: tenant.id,
          roleId: role.id,
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
        membership: {
          id: membership.id,
          role: role.slug,
          status: membership.status,
        },
      };
    });
  }

  async createTenantUser(input: CreateTenantUserInput, tenantId: string) {
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
      },
      select: {
        id: true,
        name: true,
        slug: true,
      },
    });

    if (!role) {
      throw new ConflictException('Role does not belong to this tenant');
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
          roleId: role.id,
        },
      });

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
      throw new UnauthorizedException('No active tenant membership');
    }

    const membership = user.memberships[0];

    const accessToken = await this.createAccessToken(
      user.id,
      membership.tenantId,
      membership.id,
      membership.roleId,
    );

    const refreshToken = await this.createRefreshSession(
      user.id,
      membership.tenantId,
      membership.id,
      membership.roleId,
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
      membership: {
        id: membership.id,
        role: membership.role.slug,
        status: membership.status,
        permissions: membership.role.rolePermissions.map(
          (item) => `${item.permission.resource}.${item.permission.action}`,
        ),
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
        role: true,
        user: true,
      },
    });

    if (
      !membership ||
      membership.status !== 'ACTIVE' ||
      membership.userId !== session.userId ||
      membership.tenantId !== session.tenantId ||
      membership.roleId !== session.roleId
    ) {
      await this.redis.delete(key);
      throw new UnauthorizedException('Invalid or inactive session');
    }

    const newAccessToken = await this.createAccessToken(
      membership.user.id,
      membership.tenantId,
      membership.id,
      membership.roleId,
    );

    const newRefreshToken = await this.createRefreshSession(
      membership.user.id,
      membership.tenantId,
      membership.id,
      membership.roleId,
    );

    // Refresh token rotation:
    // eski session artık geçersiz.
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
    membershipId: string,
    roleId: string,
  ): Promise<string> {
    return this.jwtService.signAsync({
      sub: userId,
      tenantId,
      membershipId,
      roleId,
    });
  }

  private async createRefreshSession(
    userId: string,
    tenantId: string,
    membershipId: string,
    roleId: string,
  ): Promise<string> {
    const sessionId = randomUUID();

    const refreshSession = {
      userId,
      tenantId,
      membershipId,
      roleId,
    };

    await this.redis.set(
      `auth:refresh:${sessionId}`,
      JSON.stringify(refreshSession),
      60 * 60 * 24 * 7,
    );

    return sessionId;
  }
}
