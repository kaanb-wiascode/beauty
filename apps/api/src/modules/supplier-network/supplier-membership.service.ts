import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';

export type SupplierMembershipRole = 'OWNER' | 'ADMIN' | 'MEMBER';

export interface UpsertSupplierMembershipInput {
  userId: string;
  role: SupplierMembershipRole;
}

@Injectable()
export class SupplierMembershipService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertOrganization(organizationId: string) {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id
       FROM supplier_organizations
       WHERE id=$1 AND status<>'ARCHIVED'
       LIMIT 1`,
      organizationId,
    );

    if (!rows.length) {
      throw new NotFoundException('Supplier organization not found');
    }
  }

  async listMemberships(organizationId: string) {
    await this.assertOrganization(organizationId);

    return this.prisma.$queryRawUnsafe(
      `SELECT
         sm.id,
         sm.supplier_organization_id AS "supplierOrganizationId",
         sm.user_id AS "userId",
         sm.role,
         sm.status,
         sm.joined_at AS "joinedAt",
         sm.created_at AS "createdAt",
         sm.updated_at AS "updatedAt",
         json_build_object(
           'id', u.id,
           'email', u.email,
           'firstName', u."firstName",
           'lastName', u."lastName"
         ) AS "user"
       FROM supplier_memberships sm
       JOIN users u ON u.id=sm.user_id
       WHERE sm.supplier_organization_id=$1
       ORDER BY sm.created_at ASC`,
      organizationId,
    );
  }

  async upsertMembership(
    organizationId: string,
    input: UpsertSupplierMembershipInput,
    actorUserId: string,
  ) {
    const [organization, user] = await Promise.all([
      this.prisma.$queryRawUnsafe<any[]>(
        `SELECT id
         FROM supplier_organizations
         WHERE id=$1 AND status<>'ARCHIVED'
         LIMIT 1`,
        organizationId,
      ),
      this.prisma.$queryRawUnsafe<any[]>(
        `SELECT id FROM users WHERE id=$1 LIMIT 1`,
        input.userId,
      ),
    ]);

    if (!organization.length) {
      throw new NotFoundException('Supplier organization not found');
    }

    if (!user.length) {
      throw new NotFoundException('User not found');
    }

    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `WITH membership AS (
         INSERT INTO supplier_memberships(
           supplier_organization_id,user_id,role,status,invited_by_user_id,joined_at
         ) VALUES($1,$2,$3,'ACTIVE',$4,NOW())
         ON CONFLICT (supplier_organization_id,user_id)
         DO UPDATE SET
           role=EXCLUDED.role,
           status='ACTIVE',
           invited_by_user_id=EXCLUDED.invited_by_user_id,
           joined_at=COALESCE(supplier_memberships.joined_at,NOW()),
           updated_at=NOW()
         RETURNING
           id,
           supplier_organization_id AS "supplierOrganizationId",
           user_id AS "userId",
           role,
           status,
           joined_at AS "joinedAt",
           created_at AS "createdAt",
           updated_at AS "updatedAt"
       ), audit AS (
         INSERT INTO supplier_membership_audit_logs(
           supplier_membership_id,
           supplier_organization_id,
           actor_user_id,
           target_user_id,
           action,
           role,
           status
         )
         SELECT
           id,$1,$4,$2,'UPSERT',role,status
         FROM membership
       )
       SELECT * FROM membership`,
      organizationId,
      input.userId,
      input.role,
      actorUserId,
    );

    return rows[0];
  }
}
