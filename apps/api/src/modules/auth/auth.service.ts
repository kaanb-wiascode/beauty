import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import * as argon2 from 'argon2';
import { RegisterInput } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

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
}
