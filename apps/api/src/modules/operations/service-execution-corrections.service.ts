import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';

import { Prisma, PrismaService } from '@beauty-erp/database';

import { TenantContext } from '../../common/tenant/tenant-context';
import type {
  CancelServiceExecutionInput,
  ReverseServiceExecutionCompletionInput,
} from './dto/service-execution-correction.dto';

type ExecutionRow = {
  id: string;
  appointmentId: string | null;
  visitId: string;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  version: number;
};

@Injectable()
export class ServiceExecutionCorrectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  private context() {
    const tenantId = this.tenantContext.getTenantId();
    const companyId = this.tenantContext.getCompanyId();
    const branchId = this.tenantContext.getBranchId();
    const membershipId = this.tenantContext.getMembershipId();
    if (!tenantId || !companyId || !membershipId) {
      throw new InternalServerErrorException('Organization context is incomplete.');
    }
    if (!branchId) throw new BadRequestException('A branch must be selected for this operation.');
    return { tenantId, companyId, branchId, membershipId };
  }

  async cancel(executionId: string, input: CancelServiceExecutionInput) {
    return this.correct(executionId, input, 'CANCEL');
  }

  async reverseCompletion(
    executionId: string,
    input: ReverseServiceExecutionCompletionInput,
  ) {
    return this.correct(executionId, input, 'REVERSE_COMPLETION');
  }

  private async correct(
    executionId: string,
    input: CancelServiceExecutionInput | ReverseServiceExecutionCompletionInput,
    action: 'CANCEL' | 'REVERSE_COMPLETION',
  ) {
    const { tenantId, companyId, branchId, membershipId } = this.context();
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRawUnsafe(
          `WITH _advisory_lock AS (SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))) SELECT 1 FROM _advisory_lock`,
          `${tenantId}:${branchId}`,
          `execution:${executionId}`,
        );

        const rows = await tx.$queryRawUnsafe<ExecutionRow[]>(
          `SELECT id, appointment_id AS "appointmentId", visit_id AS "visitId",
                  status::text AS status, version
           FROM operations_service_executions
           WHERE id=$1 AND tenant_id=$2 AND company_id=$3 AND branch_id=$4
           LIMIT 1`,
          executionId,
          tenantId,
          companyId,
          branchId,
        );
        const execution = rows[0];
        if (!execution) throw new NotFoundException('Service execution not found.');
        if (execution.version !== input.expectedVersion) {
          throw new ConflictException('Service execution changed since it was read. Refresh and retry.');
        }

        if (action === 'CANCEL' && execution.status !== 'IN_PROGRESS') {
          throw new BadRequestException('Only an in-progress service execution can be cancelled.');
        }
        if (action === 'REVERSE_COMPLETION' && execution.status !== 'COMPLETED') {
          throw new BadRequestException('Only a completed service execution can have completion reversed.');
        }

        if (action === 'REVERSE_COMPLETION') {
          if (execution.appointmentId) {
            const appointment = await tx.appointment.findFirst({
              where: { id: execution.appointmentId, tenantId, branchId },
              select: { status: true },
            });
            if (!appointment) throw new NotFoundException('Linked appointment not found.');
            if (appointment.status === 'COMPLETED') {
              throw new ConflictException({
                code: 'APPOINTMENT_ALREADY_COMPLETED',
                message: 'Execution completion cannot be reversed after the linked appointment is completed.',
              });
            }
          }

          const posted = await tx.$queryRawUnsafe<Array<{ id: string }>>(
            `SELECT m.id
             FROM inventory_movements m
             JOIN inventory_warehouses w ON w.id=m.warehouse_id
             WHERE m.tenant_id=$1 AND m.company_id=$2 AND w.branch_id=$3
               AND m.type='SERVICE_CONSUMPTION'
               AND ((m.reference_type='SERVICE_EXECUTION' AND m.reference_id=$4)
                 OR ($5::text IS NOT NULL AND m.reference_type='APPOINTMENT' AND m.reference_id=$5))
             LIMIT 1`,
            tenantId,
            companyId,
            branchId,
            execution.id,
            execution.appointmentId,
          );
          if (posted[0]) {
            throw new ConflictException({
              code: 'INVENTORY_POSTING_EXISTS',
              message: 'Execution completion cannot be reversed after inventory consumption has been posted.',
            });
          }
        }

        const updated = await tx.$queryRawUnsafe<ExecutionRow[]>(
          `UPDATE operations_service_executions
           SET status='CANCELLED', cancelled_at=CURRENT_TIMESTAMP,
               version=version+1, updated_at=CURRENT_TIMESTAMP
           WHERE id=$1 AND tenant_id=$2 AND company_id=$3 AND branch_id=$4
             AND version=$5
           RETURNING id, appointment_id AS "appointmentId", visit_id AS "visitId",
                     status::text AS status, version`,
          executionId,
          tenantId,
          companyId,
          branchId,
          input.expectedVersion,
        );
        if (!updated[0]) {
          throw new ConflictException('Service execution changed during correction. Refresh and retry.');
        }

        await tx.$executeRawUnsafe(
          `UPDATE operations_service_execution_staff_assignments
           SET ended_at=COALESCE(ended_at,CURRENT_TIMESTAMP), version=version+1,
               updated_at=CURRENT_TIMESTAMP
           WHERE execution_id=$1 AND tenant_id=$2 AND branch_id=$3 AND ended_at IS NULL`,
          executionId,
          tenantId,
          branchId,
        );

        await tx.$executeRawUnsafe(
          `INSERT INTO operations_service_execution_corrections(
             tenant_id,company_id,branch_id,execution_id,action,from_status,to_status,
             reason_code,reason_label,note,execution_version_before,actor_membership_id
           ) VALUES($1,$2,$3,$4,$5,$6::"ServiceExecutionStatus",'CANCELLED',$7,$8,$9,$10,$11)`,
          tenantId,
          companyId,
          branchId,
          executionId,
          action,
          execution.status,
          input.reasonCode,
          input.reasonLabel,
          input.note ?? null,
          execution.version,
          membershipId,
        );

        await tx.$executeRawUnsafe(
          `INSERT INTO operations_service_execution_events(
             execution_id,tenant_id,branch_id,actor_membership_id,event_type,from_status,to_status,note
           ) VALUES($1,$2,$3,$4,$5,$6::"ServiceExecutionStatus",'CANCELLED',$7)`,
          executionId,
          tenantId,
          branchId,
          membershipId,
          action === 'CANCEL' ? 'SERVICE_CANCELLED' : 'SERVICE_COMPLETION_REVERSED',
          execution.status,
          `${input.reasonCode}: ${input.reasonLabel}${input.note ? ` — ${input.note}` : ''}`,
        );

        return {
          execution: updated[0],
          correction: {
            action,
            fromStatus: execution.status,
            toStatus: 'CANCELLED' as const,
            reasonCode: input.reasonCode,
            reasonLabel: input.reasonLabel,
            note: input.note ?? null,
          },
          restartAllowed: true,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
