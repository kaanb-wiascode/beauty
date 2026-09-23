import { BadRequestException, ConflictException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import { OperationsStaffEligibilityService } from './operations-staff-eligibility.service';
import type { AddExecutionStaffInput, EndExecutionStaffInput, HandoffExecutionStaffInput } from './dto/service-execution.dto';

type AssignmentRow = {
  id: string;
  executionId: string;
  staffId: string;
  staffName: string;
  role: 'PRIMARY' | 'ASSISTANT' | 'HANDOFF';
  startedAt: Date;
  endedAt: Date | null;
  note: string | null;
  version: number;
};

type ExecutionContext = {
  id: string;
  appointmentId: string | null;
  serviceId: string;
  status: string;
  startAt: Date;
  endAt: Date;
};

@Injectable()
export class ServiceExecutionStaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
    private readonly eligibility: OperationsStaffEligibilityService,
  ) {}

  private context() {
    const tenantId = this.tenantContext.getTenantId();
    const companyId = this.tenantContext.getCompanyId();
    const branchId = this.tenantContext.getBranchId();
    const membershipId = this.tenantContext.getMembershipId();
    if (!tenantId || !companyId || !membershipId) throw new InternalServerErrorException('Organization context is incomplete.');
    if (!branchId) throw new BadRequestException('A branch must be selected for this operation.');
    return { tenantId, companyId, branchId, membershipId };
  }

  async list(executionId: string) {
    const { tenantId, companyId, branchId } = this.context();
    await this.requireExecution(this.prisma, executionId, tenantId, companyId, branchId);
    return this.prisma.$queryRawUnsafe<AssignmentRow[]>(
      `SELECT a.id,a.execution_id AS "executionId",a.staff_id AS "staffId",
              trim(concat(s."firstName",' ',s."lastName")) AS "staffName",
              a.role,a.started_at AS "startedAt",a.ended_at AS "endedAt",a.note,a.version
       FROM operations_service_execution_staff_assignments a
       JOIN staff s ON s.id=a.staff_id
       WHERE a.execution_id=$1 AND a.tenant_id=$2 AND a.company_id=$3 AND a.branch_id=$4
       ORDER BY a.started_at ASC,a.created_at ASC`,
      executionId, tenantId, companyId, branchId,
    );
  }

  async add(executionId: string, input: AddExecutionStaffInput) {
    const { tenantId, companyId, branchId, membershipId } = this.context();
    const execution = await this.requireExecution(this.prisma, executionId, tenantId, companyId, branchId);
    this.assertInProgress(execution);
    await this.assertEligible(execution, input.staffId);

    return this.prisma.$transaction(async tx => {
      await this.lock(tx, tenantId, branchId, executionId);
      await this.requireExecution(tx, executionId, tenantId, companyId, branchId, true);
      const existing = await tx.$queryRawUnsafe<AssignmentRow[]>(
        `SELECT a.id,a.execution_id AS "executionId",a.staff_id AS "staffId",
                trim(concat(s."firstName",' ',s."lastName")) AS "staffName",
                a.role,a.started_at AS "startedAt",a.ended_at AS "endedAt",a.note,a.version
         FROM operations_service_execution_staff_assignments a JOIN staff s ON s.id=a.staff_id
         WHERE a.execution_id=$1 AND a.staff_id=$2 AND a.ended_at IS NULL LIMIT 1`,
        executionId,input.staffId,
      );
      if (existing[0]) return existing[0];
      const rows = await tx.$queryRawUnsafe<AssignmentRow[]>(
        `INSERT INTO operations_service_execution_staff_assignments(
           execution_id,tenant_id,company_id,branch_id,staff_id,role,note,created_by_membership_id
         ) VALUES($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING id,execution_id AS "executionId",staff_id AS "staffId",''::text AS "staffName",role,
                   started_at AS "startedAt",ended_at AS "endedAt",note,version`,
        executionId,tenantId,companyId,branchId,input.staffId,input.role,input.note ?? null,membershipId,
      );
      await this.event(tx, executionId, tenantId, branchId, membershipId, 'STAFF_ASSIGNED', `${input.role}:${input.staffId}${input.note ? ` - ${input.note}` : ''}`);
      return rows[0];
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async end(executionId: string, assignmentId: string, input: EndExecutionStaffInput) {
    const { tenantId, companyId, branchId, membershipId } = this.context();
    return this.prisma.$transaction(async tx => {
      await this.lock(tx, tenantId, branchId, executionId);
      const execution = await this.requireExecution(tx, executionId, tenantId, companyId, branchId, true);
      this.assertInProgress(execution);
      const rows = await tx.$queryRawUnsafe<AssignmentRow[]>(
        `UPDATE operations_service_execution_staff_assignments a
         SET ended_at=CURRENT_TIMESTAMP,ended_by_membership_id=$5,version=version+1,updated_at=CURRENT_TIMESTAMP
         WHERE a.id=$1 AND a.execution_id=$2 AND a.tenant_id=$3 AND a.branch_id=$4
           AND a.ended_at IS NULL AND a.version=$6 AND a.role <> 'PRIMARY'::"ServiceExecutionStaffRole"
         RETURNING a.id,a.execution_id AS "executionId",a.staff_id AS "staffId",''::text AS "staffName",a.role,
                   a.started_at AS "startedAt",a.ended_at AS "endedAt",a.note,a.version`,
        assignmentId,executionId,tenantId,branchId,membershipId,input.expectedVersion,
      );
      if (!rows[0]) throw new ConflictException('Assignment changed, is already ended, or primary assignment cannot be ended directly.');
      await this.event(tx, executionId, tenantId, branchId, membershipId, 'STAFF_ASSIGNMENT_ENDED', `${rows[0].staffId}${input.note ? ` - ${input.note}` : ''}`);
      return rows[0];
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async handoff(executionId: string, input: HandoffExecutionStaffInput) {
    const { tenantId, companyId, branchId, membershipId } = this.context();
    const execution = await this.requireExecution(this.prisma, executionId, tenantId, companyId, branchId);
    this.assertInProgress(execution);
    await this.assertEligible(execution, input.toStaffId);

    return this.prisma.$transaction(async tx => {
      await this.lock(tx, tenantId, branchId, executionId);
      const currentExecution = await this.requireExecution(tx, executionId, tenantId, companyId, branchId, true);
      this.assertInProgress(currentExecution);
      const closed = await tx.$queryRawUnsafe<AssignmentRow[]>(
        `UPDATE operations_service_execution_staff_assignments a
         SET ended_at=CURRENT_TIMESTAMP,ended_by_membership_id=$5,version=version+1,updated_at=CURRENT_TIMESTAMP
         WHERE a.id=$1 AND a.execution_id=$2 AND a.tenant_id=$3 AND a.branch_id=$4
           AND a.ended_at IS NULL AND a.version=$6
         RETURNING a.id,a.execution_id AS "executionId",a.staff_id AS "staffId",''::text AS "staffName",a.role,
                   a.started_at AS "startedAt",a.ended_at AS "endedAt",a.note,a.version`,
        input.fromAssignmentId,executionId,tenantId,branchId,membershipId,input.expectedVersion,
      );
      if (!closed[0]) throw new ConflictException('Source staff assignment changed or is no longer active.');

      const duplicate = await tx.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT id FROM operations_service_execution_staff_assignments
         WHERE execution_id=$1 AND staff_id=$2 AND ended_at IS NULL LIMIT 1`, executionId,input.toStaffId,
      );
      if (duplicate[0]) throw new ConflictException('Target staff already has an active assignment on this execution.');

      const created = await tx.$queryRawUnsafe<AssignmentRow[]>(
        `INSERT INTO operations_service_execution_staff_assignments(
           execution_id,tenant_id,company_id,branch_id,staff_id,role,note,created_by_membership_id
         ) VALUES($1,$2,$3,$4,$5,'HANDOFF',$6,$7)
         RETURNING id,execution_id AS "executionId",staff_id AS "staffId",''::text AS "staffName",role,
                   started_at AS "startedAt",ended_at AS "endedAt",note,version`,
        executionId,tenantId,companyId,branchId,input.toStaffId,input.note ?? null,membershipId,
      );
      await tx.$executeRawUnsafe(
        `UPDATE operations_service_executions SET staff_id=$2,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
        executionId,input.toStaffId,
      );
      await this.event(tx, executionId, tenantId, branchId, membershipId, 'STAFF_HANDOFF', `${closed[0].staffId} -> ${input.toStaffId}${input.note ? ` - ${input.note}` : ''}`);
      return { from: closed[0], to: created[0] };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  private async assertEligible(execution: ExecutionContext, staffId: string) {
    const result = await this.eligibility.check({ staffId, serviceId: execution.serviceId, startAt: execution.startAt, endAt: execution.endAt });
    if (!result.allowed) throw new ConflictException({ code: 'STAFF_ELIGIBILITY_BLOCKED', message: 'Target staff does not satisfy the active eligibility policy.', blockers: result.blockers });
    return result;
  }

  private async requireExecution(db: Pick<PrismaService,'$queryRawUnsafe'> | Prisma.TransactionClient, executionId: string, tenantId: string, companyId: string, branchId: string, forUpdate = false) {
    const rows = await db.$queryRawUnsafe<ExecutionContext[]>(
      `SELECT e.id,e.appointment_id AS "appointmentId",e.service_id AS "serviceId",e.status::text AS status,
              COALESCE(a."startAt", e.started_at) AS "startAt",
              COALESCE(a."endAt", e.started_at + (svc."durationMinutes" * INTERVAL '1 minute')) AS "endAt"
       FROM operations_service_executions e
       LEFT JOIN appointments a ON a.id=e.appointment_id
       JOIN services svc ON svc.id=e.service_id
       WHERE e.id=$1 AND e.tenant_id=$2 AND e.company_id=$3 AND e.branch_id=$4${forUpdate ? ' FOR UPDATE OF e' : ''}`,
      executionId,tenantId,companyId,branchId,
    );
    if (!rows[0]) throw new NotFoundException('Service execution not found.');
    return rows[0];
  }

  private assertInProgress(execution: ExecutionContext) {
    if (execution.status !== 'IN_PROGRESS') throw new ConflictException('Staff assignments can only change while service execution is IN_PROGRESS.');
  }

  private lock(tx: Prisma.TransactionClient, tenantId: string, branchId: string, executionId: string) {
    return tx.$queryRaw`SELECT pg_advisory_xact_lock(
      hashtext(${`${tenantId}:${branchId}`}),
      hashtext(${`execution-staff:${executionId}`})
    )`;
  }

  private event(tx: Prisma.TransactionClient, executionId: string, tenantId: string, branchId: string, membershipId: string, eventType: string, note: string) {
    return tx.$executeRawUnsafe(
      `INSERT INTO operations_service_execution_events(execution_id,tenant_id,branch_id,actor_membership_id,event_type,from_status,to_status,note)
       VALUES($1,$2,$3,$4,$5,'IN_PROGRESS','IN_PROGRESS',$6)`, executionId,tenantId,branchId,membershipId,eventType,note,
    );
  }
}