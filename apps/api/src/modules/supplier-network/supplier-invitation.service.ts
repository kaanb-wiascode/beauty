import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import * as argon2 from 'argon2';
import { createHash, randomBytes, randomUUID } from 'node:crypto';

import type { SupplierPortalPrincipal, SupplierPortalRole } from './supplier-portal-auth.service';

export interface CreateSupplierInvitationInput {
  email: string;
  role: SupplierPortalRole;
  expiresInHours?: number;
}

export interface AcceptSupplierInvitationInput {
  token: string;
  password: string;
  firstName: string;
  lastName: string;
}

interface InvitationRow {
  id: string;
  supplierOrganizationId: string;
  email: string;
  role: SupplierPortalRole;
  invitedByUserId: string;
}

@Injectable()
export class SupplierInvitationService {
  constructor(private readonly prisma: PrismaService) {}

  private hash(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }

  async createInvitation(
    principal: SupplierPortalPrincipal,
    input: CreateSupplierInvitationInput,
  ) {
    const email = input.email.trim().toLowerCase();
    const expiresInHours = Math.min(Math.max(input.expiresInHours ?? 72, 1), 168);
    const token = randomBytes(32).toString('base64url');
    const tokenHash = this.hash(token);
    const emailHash = this.hash(email);
    const invitationId = randomUUID();

    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `UPDATE supplier_invitations
         SET status='REVOKED', updated_at=NOW()
         WHERE supplier_organization_id=$1
           AND lower(email)=lower($2)
           AND status='PENDING'`,
        principal.supplierOrganizationId,
        email,
      );

      await tx.$executeRawUnsafe(
        `WITH invitation AS (
           INSERT INTO supplier_invitations(
             id,supplier_organization_id,email,role,token_hash,status,
             invited_by_user_id,expires_at
           ) VALUES($1,$2,$3,$4,$5,'PENDING',$6,NOW()+($7::int * INTERVAL '1 hour'))
           RETURNING id,supplier_organization_id,role
         )
         INSERT INTO supplier_invitation_audit_logs(
           supplier_invitation_id,supplier_organization_id,actor_user_id,
           action,target_email_hash,role
         )
         SELECT id,supplier_organization_id,$6,'CREATED',$8,role
         FROM invitation`,
        invitationId,
        principal.supplierOrganizationId,
        email,
        input.role,
        tokenHash,
        principal.sub,
        expiresInHours,
        emailHash,
      );
    });

    return {
      id: invitationId,
      email,
      role: input.role,
      expiresInHours,
      acceptanceToken: token,
    };
  }

  async acceptInvitation(input: AcceptSupplierInvitationInput) {
    const tokenHash = this.hash(input.token.trim());

    return this.prisma.$transaction(async (tx) => {
      const invitations = await tx.$queryRawUnsafe<InvitationRow[]>(
        `SELECT
           si.id,
           si.supplier_organization_id AS "supplierOrganizationId",
           lower(si.email) AS email,
           si.role,
           si.invited_by_user_id AS "invitedByUserId"
         FROM supplier_invitations si
         JOIN supplier_organizations so ON so.id=si.supplier_organization_id
         WHERE si.token_hash=$1
           AND si.status='PENDING'
           AND si.expires_at > NOW()
           AND so.status='ACTIVE'
         LIMIT 1`,
        tokenHash,
      );

      const invitation = invitations[0];
      if (!invitation) {
        throw new UnauthorizedException('Invitation is invalid or expired');
      }

      let user = await tx.user.findUnique({
        where: { email: invitation.email },
        select: { id: true, passwordHash: true },
      });

      if (user) {
        const valid = await argon2.verify(user.passwordHash, input.password);
        if (!valid) {
          throw new UnauthorizedException('Invalid credentials for invited account');
        }
      } else {
        const passwordHash = await argon2.hash(input.password);
        user = await tx.user.create({
          data: {
            email: invitation.email,
            passwordHash,
            firstName: input.firstName.trim(),
            lastName: input.lastName.trim(),
          },
          select: { id: true, passwordHash: true },
        });
      }

      const rows = await tx.$queryRawUnsafe<Array<{ membershipId: string }>>(
        `WITH claimed AS (
           UPDATE supplier_invitations
           SET status='ACCEPTED',accepted_by_user_id=$2,accepted_at=NOW(),updated_at=NOW()
           WHERE id=$1 AND status='PENDING' AND expires_at > NOW()
           RETURNING id,supplier_organization_id,role,invited_by_user_id,email
         ), membership AS (
           INSERT INTO supplier_memberships(
             supplier_organization_id,user_id,role,status,invited_by_user_id,joined_at
           )
           SELECT supplier_organization_id,$2,role,'ACTIVE',invited_by_user_id,NOW()
           FROM claimed
           ON CONFLICT (supplier_organization_id,user_id)
           DO UPDATE SET
             role=EXCLUDED.role,
             status='ACTIVE',
             invited_by_user_id=EXCLUDED.invited_by_user_id,
             joined_at=COALESCE(supplier_memberships.joined_at,NOW()),
             updated_at=NOW()
           RETURNING id,supplier_organization_id,user_id,role,status
         ), membership_audit AS (
           INSERT INTO supplier_membership_audit_logs(
             supplier_membership_id,supplier_organization_id,actor_user_id,
             target_user_id,action,role,status
           )
           SELECT id,supplier_organization_id,$2,user_id,'INVITATION_ACCEPTED',role,status
           FROM membership
         ), invitation_audit AS (
           INSERT INTO supplier_invitation_audit_logs(
             supplier_invitation_id,supplier_organization_id,actor_user_id,
             action,target_email_hash,role
           )
           SELECT c.id,c.supplier_organization_id,$2,'ACCEPTED',$3,c.role
           FROM claimed c
         )
         SELECT id AS "membershipId" FROM membership`,
        invitation.id,
        user.id,
        this.hash(invitation.email),
      );

      if (!rows[0]) {
        throw new ConflictException('Invitation has already been consumed');
      }

      return {
        supplierOrganizationId: invitation.supplierOrganizationId,
        supplierMembershipId: rows[0].membershipId,
        role: invitation.role,
      };
    });
  }
}
