import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Prisma, PrismaService } from '@beauty-erp/database';
import { PlatformAuditService } from '../platform-audit/platform-audit.service';

type DeliveryRow = {
  id: string;
  provisioningRunId: string;
  tenantId: string;
  companyId: string;
  roleId: string;
  email: string;
  status: 'PENDING' | 'CLAIMED' | 'RETRY' | 'SENT' | 'DEAD' | 'CANCELLED';
  invitationId: string | null;
  attemptCount: number;
  nextAttemptAt: Date;
  lastError: string | null;
  sentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type RunContextRow = {
  id: string;
  tenantId: string | null;
  ownerEmail: string | null;
  companySlug: string | null;
};

@Injectable()
export class PlatformOwnerInvitationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly platformAudit: PlatformAuditService,
  ) {}

  async bindAndQueue(
    runId: string,
    ownerEmail: string,
    actorUserId: string,
    options?: { reason?: string | null; correlationId?: string | null },
    client?: Prisma.TransactionClient,
  ) {
    const email = this.normalizeEmail(ownerEmail);

    const execute = async (tx: Prisma.TransactionClient) => {
      await tx.$queryRaw`
        SELECT pg_advisory_xact_lock(hashtext('platform-provisioning'), hashtext(${runId}))
      `;

      const actors = await tx.$queryRaw<Array<{ userId: string }>>`
        SELECT user_id AS "userId"
        FROM platform_admin_users
        WHERE user_id = ${actorUserId} AND status = 'ACTIVE'
        LIMIT 1
      `;
      if (!actors[0]) {
        throw new BadRequestException('Active platform administrator is required.');
      }

      const runs = await tx.$queryRaw<RunContextRow[]>`
        SELECT
          id,
          tenant_id AS "tenantId",
          owner_email AS "ownerEmail",
          input ->> 'companySlug' AS "companySlug"
        FROM platform_provisioning_runs
        WHERE id = ${runId}
        FOR UPDATE
      `;
      const run = runs[0];
      if (!run) throw new NotFoundException('Provisioning run not found.');
      if (!run.tenantId || !run.companySlug) {
        throw new ConflictException('Tenant and company provisioning must complete first.');
      }
      if (run.ownerEmail && run.ownerEmail.toLowerCase() !== email) {
        throw new ConflictException(
          'Provisioning run is already bound to a different owner email.',
        );
      }

      const company = await tx.company.findFirst({
        where: { tenantId: run.tenantId, slug: run.companySlug },
        select: { id: true },
      });
      if (!company) {
        throw new ConflictException('Primary company must exist before owner invitation.');
      }

      const role = await tx.role.findFirst({
        where: {
          tenantId: run.tenantId,
          companyId: company.id,
          slug: 'owner',
          scope: 'CENTRAL',
        },
        select: { id: true },
      });
      if (!role) {
        throw new ConflictException('Owner role must exist before owner invitation.');
      }

      await tx.$executeRaw`
        UPDATE platform_provisioning_runs
        SET owner_email = ${email}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${runId}
      `;

      const inserted = await tx.$queryRaw<DeliveryRow[]>`
        INSERT INTO platform_owner_invitation_deliveries (
          provisioning_run_id,
          tenant_id,
          company_id,
          role_id,
          email,
          branch_ids,
          status,
          created_by_platform_user_id,
          correlation_id
        ) VALUES (
          ${runId},
          ${run.tenantId},
          ${company.id},
          ${role.id},
          ${email},
          '[]'::jsonb,
          'PENDING',
          ${actorUserId},
          ${options?.correlationId ?? null}
        )
        ON CONFLICT (provisioning_run_id) DO NOTHING
        RETURNING
          id,
          provisioning_run_id AS "provisioningRunId",
          tenant_id AS "tenantId",
          company_id AS "companyId",
          role_id AS "roleId",
          email,
          status,
          invitation_id AS "invitationId",
          attempt_count AS "attemptCount",
          next_attempt_at AS "nextAttemptAt",
          last_error AS "lastError",
          sent_at AS "sentAt",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
      `;

      const delivery = inserted[0] ?? (await this.findByRun(runId, tx));
      if (!delivery) {
        throw new ConflictException('Owner invitation delivery could not be queued.');
      }
      if (delivery.email.toLowerCase() !== email) {
        throw new ConflictException(
          'Provisioning run is already bound to a different owner invitation delivery.',
        );
      }

      await tx.$executeRaw`
        UPDATE platform_provisioning_steps
        SET
          status = CASE WHEN status = 'COMPLETED' THEN status ELSE 'RUNNING' END,
          output = ${JSON.stringify({
            deliveryRequestId: delivery.id,
            deliveryStatus: delivery.status,
            email,
          })}::jsonb,
          started_at = COALESCE(started_at, CURRENT_TIMESTAMP),
          last_error = NULL,
          updated_at = CURRENT_TIMESTAMP
        WHERE run_id = ${runId} AND step_key = 'OWNER_INVITATION'
      `;

      if (inserted[0]) {
        await this.platformAudit.record(
          {
            actorUserId,
            resource: 'provisioning',
            action: 'owner_invitation.queue',
            targetTenantId: run.tenantId,
            targetEntityType: 'platform_owner_invitation_delivery',
            targetEntityId: delivery.id,
            reason: options?.reason ?? null,
            afterState: {
              provisioningRunId: runId,
              companyId: company.id,
              roleId: role.id,
              email,
              status: delivery.status,
            },
            correlationId: options?.correlationId ?? null,
          },
          tx,
        );
      }

      return delivery;
    };

    if (client) return execute(client);
    return this.prisma.$transaction(execute);
  }

  async getByRun(runId: string) {
    return this.findByRun(runId, this.prisma);
  }

  private async findByRun(
    runId: string,
    client: Pick<Prisma.TransactionClient, '$queryRaw'>,
  ) {
    const rows = await client.$queryRaw<DeliveryRow[]>`
      SELECT
        id,
        provisioning_run_id AS "provisioningRunId",
        tenant_id AS "tenantId",
        company_id AS "companyId",
        role_id AS "roleId",
        email,
        status,
        invitation_id AS "invitationId",
        attempt_count AS "attemptCount",
        next_attempt_at AS "nextAttemptAt",
        last_error AS "lastError",
        sent_at AS "sentAt",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM platform_owner_invitation_deliveries
      WHERE provisioning_run_id = ${runId}
      LIMIT 1
    `;
    return rows[0] ?? null;
  }

  private normalizeEmail(value: string) {
    const email = value.trim().toLowerCase();
    if (!email || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('A valid ownerEmail is required.');
    }
    return email;
  }
}
