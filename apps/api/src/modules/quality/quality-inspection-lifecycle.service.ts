import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

@Injectable()
export class QualityInspectionLifecycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
  ) {}

  private context() {
    return this.tenant.getContext();
  }

  private async assertUserScope(
    tx: Prisma.TransactionClient,
    userId: string | null | undefined,
    branchId: string,
  ) {
    if (!userId) return;
    const c = this.context();
    const rows = await tx.$queryRawUnsafe<any[]>(
      `SELECT m.id
       FROM memberships m
       JOIN roles r ON r.id=m."roleId" AND r."tenantId"=m."tenantId"
       WHERE m."userId"=$1::text AND m."tenantId"=$2::text AND m.status='ACTIVE'
         AND (r.scope='CENTRAL' OR m."companyId"=$3::text)
         AND (r.scope<>'BRANCH' OR EXISTS(
           SELECT 1 FROM membership_branch_access mba
           WHERE mba."membershipId"=m.id AND mba."branchId"=$4::text
         ))
       LIMIT 1`,
      userId,
      c.tenantId,
      c.companyId,
      branchId,
    );
    if (!rows.length) {
      throw new BadRequestException('Assigned user is outside tenant/company/branch scope.');
    }
  }

  async cancel(id: string, reason: string, actorUserId: string) {
    const note = reason?.trim();
    if (!note) throw new BadRequestException('Cancellation reason is required.');
    const c = this.context();

    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.$queryRawUnsafe<any[]>(
          `SELECT id,status,branch_id AS "branchId",cancel_reason AS "cancelReason",
                  cancelled_at AS "cancelledAt",rescheduled_to_inspection_id AS "rescheduledToInspectionId"
           FROM quality_inspections
           WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text
             AND ($4::text IS NULL OR branch_id=$4::text)
           FOR UPDATE`,
          id,
          c.tenantId,
          c.companyId,
          c.branchId,
        );
        if (!rows.length) throw new NotFoundException('Inspection not found.');
        const inspection = rows[0];
        if (inspection.status === 'CANCELLED') return { ...inspection, duplicate: true };
        if (inspection.status !== 'PLANNED') {
          throw new BadRequestException('Only planned inspections can be cancelled.');
        }

        const updated = await tx.$queryRawUnsafe<any[]>(
          `UPDATE quality_inspections
           SET status='CANCELLED',cancelled_at=NOW(),cancel_reason=$2,
               updated_by_user_id=$3::text,updated_at=NOW()
           WHERE id=$1::text
           RETURNING id,status,cancelled_at AS "cancelledAt",cancel_reason AS "cancelReason"`,
          id,
          note,
          actorUserId,
        );
        await tx.$executeRawUnsafe(
          `INSERT INTO quality_inspection_events(
             inspection_id,tenant_id,company_id,branch_id,event_type,from_status,to_status,note,actor_user_id
           ) VALUES($1::text,$2::text,$3::text,$4::text,'CANCELLED','PLANNED','CANCELLED',$5,$6::text)`,
          id,
          c.tenantId,
          c.companyId,
          inspection.branchId,
          note,
          actorUserId,
        );
        return { ...updated[0], duplicate: false };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async reschedule(
    id: string,
    input: { plannedFor: string; inspectorUserId?: string | null; reason?: string | null },
    actorUserId: string,
  ) {
    const plannedFor = new Date(input.plannedFor);
    if (Number.isNaN(plannedFor.getTime())) throw new BadRequestException('plannedFor is invalid.');
    const reason = input.reason?.trim() || 'Inspection rescheduled';
    const c = this.context();

    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.$queryRawUnsafe<any[]>(
          `SELECT id,status,tenant_id AS "tenantId",company_id AS "companyId",branch_id AS "branchId",
                  template_id AS "templateId",schedule_id AS "scheduleId",inspector_user_id AS "inspectorUserId",
                  rescheduled_to_inspection_id AS "rescheduledToInspectionId"
           FROM quality_inspections
           WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text
             AND ($4::text IS NULL OR branch_id=$4::text)
           FOR UPDATE`,
          id,
          c.tenantId,
          c.companyId,
          c.branchId,
        );
        if (!rows.length) throw new NotFoundException('Inspection not found.');
        const original = rows[0];
        if (original.rescheduledToInspectionId) {
          const replacement = await tx.$queryRawUnsafe<any[]>(
            `SELECT id,status,planned_for AS "plannedFor",inspector_user_id AS "inspectorUserId"
             FROM quality_inspections WHERE id=$1::text LIMIT 1`,
            original.rescheduledToInspectionId,
          );
          return { originalInspectionId: id, replacement: replacement[0], duplicate: true };
        }
        if (original.status !== 'PLANNED') {
          throw new BadRequestException('Only planned inspections can be rescheduled.');
        }

        const inspectorUserId = input.inspectorUserId ?? original.inspectorUserId ?? null;
        await this.assertUserScope(tx, inspectorUserId, original.branchId);
        const key = `inspection-reschedule:${id}:${Math.floor(plannedFor.getTime() / 1000)}`;
        const replacementRows = await tx.$queryRawUnsafe<any[]>(
          `INSERT INTO quality_inspections(
             tenant_id,company_id,branch_id,template_id,schedule_id,idempotency_key,status,planned_for,
             inspector_user_id,rescheduled_from_inspection_id,created_by_user_id,updated_by_user_id
           ) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6,'PLANNED',$7,$8::text,$9::text,$10::text,$10::text)
           ON CONFLICT(tenant_id,company_id,idempotency_key) DO UPDATE
             SET idempotency_key=EXCLUDED.idempotency_key
           RETURNING id,status,planned_for AS "plannedFor",inspector_user_id AS "inspectorUserId"`,
          c.tenantId,
          c.companyId,
          original.branchId,
          original.templateId,
          original.scheduleId,
          key,
          plannedFor,
          inspectorUserId,
          id,
          actorUserId,
        );
        const replacement = replacementRows[0];

        await tx.$executeRawUnsafe(
          `UPDATE quality_inspections
           SET status='CANCELLED',cancelled_at=NOW(),cancel_reason=$2,
               rescheduled_to_inspection_id=$3::text,updated_by_user_id=$4::text,updated_at=NOW()
           WHERE id=$1::text`,
          id,
          reason,
          replacement.id,
          actorUserId,
        );
        await tx.$executeRawUnsafe(
          `INSERT INTO quality_inspection_events(
             inspection_id,tenant_id,company_id,branch_id,event_type,from_status,to_status,related_inspection_id,note,actor_user_id
           ) VALUES($1::text,$2::text,$3::text,$4::text,'RESCHEDULED','PLANNED','CANCELLED',$5::text,$6,$7::text)`,
          id,
          c.tenantId,
          c.companyId,
          original.branchId,
          replacement.id,
          reason,
          actorUserId,
        );

        return { originalInspectionId: id, replacement, duplicate: false };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
