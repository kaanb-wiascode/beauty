import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import { OrganizationScopeService } from '../../common/tenant/organization-scope.service';

type ShiftWindow = {
  startsAt: Date | string;
  endsAt: Date | string;
};

type AssignmentRow = ShiftWindow & {
  id: string;
  staffId: string;
  branchId: string;
  shiftId: string;
  shiftStatus: string;
};

type SwapRequestRow = ShiftWindow & {
  id: string;
  branch_id: string;
  requester_staff_id: string;
  target_staff_id: string;
  requester_assignment_id: string;
  target_assignment_id: string | null;
};

type OpenBidRow = ShiftWindow & {
  id: string;
  branch_id: string;
  scheduled_shift_id: string;
  staff_id: string;
  openSlots: number;
  shiftStatus: string;
};

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23505'
  );
}

@Injectable()
export class ShiftExchangeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: TenantContext,
    private readonly organizationScope: OrganizationScopeService,
  ) {}

  private scope() {
    const tenantId = this.ctx.getTenantId();
    const companyId = this.ctx.getCompanyId();
    if (!tenantId || !companyId) {
      throw new BadRequestException('Tenant and company context are required.');
    }
    return { tenantId, companyId };
  }

  private async branches(): Promise<string[] | null> {
    const scope = await this.organizationScope.getBranchScopedWhere();
    if (!('branchId' in scope)) return null;
    return typeof scope.branchId === 'string' ? [scope.branchId] : scope.branchId.in;
  }

  private async eligible(
    tx: Prisma.TransactionClient,
    tenantId: string,
    companyId: string,
    branchId: string,
    staffId: string,
    shift: ShiftWindow,
    ignoreAssignmentId?: string,
  ) {
    const staff = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT s.id FROM staff s JOIN branches b ON b.id=s.branch_id WHERE s.id=$1 AND s.tenant_id=$2 AND s.branch_id=$3 AND s.status='ACTIVE' AND b.company_id=$4 FOR UPDATE OF s`,
      staffId,
      tenantId,
      branchId,
      companyId,
    );
    if (!staff.length) throw new NotFoundException('Staff not found in shift branch.');

    const overlap = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT a.id FROM hr_shift_assignments a JOIN hr_scheduled_shifts sh ON sh.id=a.scheduled_shift_id WHERE a.tenant_id=$1 AND a.company_id=$2 AND a.staff_id=$3 AND a.status<>'CANCELLED' AND ($6::text IS NULL OR a.id<>$6) AND sh.status<>'CANCELLED' AND sh.starts_at<$5 AND sh.ends_at>$4 LIMIT 1`,
      tenantId,
      companyId,
      staffId,
      shift.startsAt,
      shift.endsAt,
      ignoreAssignmentId ?? null,
    );
    if (overlap.length) throw new ConflictException('Staff has an overlapping shift.');

    const leave = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM leave_requests WHERE tenant_id=$1 AND staff_id=$2 AND status='APPROVED' AND start_date<=$4::date AND end_date>=$3::date LIMIT 1`,
      tenantId,
      staffId,
      new Date(shift.startsAt).toISOString().slice(0, 10),
      new Date(shift.endsAt).toISOString().slice(0, 10),
    );
    if (leave.length) {
      throw new ConflictException('Staff has approved leave during the shift.');
    }
  }

  async swaps() {
    const { tenantId, companyId } = this.scope();
    const branches = await this.branches();
    return this.prisma.$queryRawUnsafe<
      Array<{
        id: string;
        branchId: string;
        requesterStaffId: string;
        targetStaffId: string | null;
        requesterAssignmentId: string;
        targetAssignmentId: string | null;
        status: string;
        requesterNote: string | null;
        targetNote: string | null;
        managerNote: string | null;
        createdAt: Date;
      }>
    >(
      `SELECT r.id,r.branch_id AS "branchId",r.requester_staff_id AS "requesterStaffId",r.target_staff_id AS "targetStaffId",r.requester_assignment_id AS "requesterAssignmentId",r.target_assignment_id AS "targetAssignmentId",r.status,r.requester_note AS "requesterNote",r.target_note AS "targetNote",r.manager_note AS "managerNote",r.created_at AS "createdAt" FROM hr_shift_swap_requests r WHERE r.tenant_id=$1 AND r.company_id=$2 AND ($3::text[] IS NULL OR r.branch_id=ANY($3::text[])) ORDER BY r.created_at DESC`,
      tenantId,
      companyId,
      branches,
    );
  }

  async requestSwap(
    assignmentId: string,
    targetStaffId: string | null,
    note: string,
    actor: string,
  ) {
    const { tenantId, companyId } = this.scope();
    const branches = await this.branches();
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRawUnsafe<AssignmentRow[]>(
        `SELECT a.id,a.staff_id AS "staffId",a.branch_id AS "branchId",sh.id AS "shiftId",sh.starts_at AS "startsAt",sh.ends_at AS "endsAt",sh.status AS "shiftStatus" FROM hr_shift_assignments a JOIN hr_scheduled_shifts sh ON sh.id=a.scheduled_shift_id WHERE a.id=$1 AND a.tenant_id=$2 AND a.company_id=$3 AND a.status IN('ASSIGNED','CONFIRMED') AND ($4::text[] IS NULL OR a.branch_id=ANY($4::text[])) FOR UPDATE OF a`,
        assignmentId,
        tenantId,
        companyId,
        branches,
      );
      const assignment = rows[0];
      if (!assignment) throw new NotFoundException('Assignment not found.');
      if (!['DRAFT', 'PUBLISHED'].includes(assignment.shiftStatus)) {
        throw new ConflictException('Shift cannot be swapped.');
      }
      if (targetStaffId) {
        await this.eligible(
          tx,
          tenantId,
          companyId,
          assignment.branchId,
          targetStaffId,
          assignment,
        );
      }
      try {
        const inserted = await tx.$queryRawUnsafe<Array<{ id: string; status: string }>>(
          `INSERT INTO hr_shift_swap_requests(id,tenant_id,company_id,branch_id,requester_staff_id,requester_assignment_id,target_staff_id,requester_note,accepted_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,status`,
          randomUUID(),
          tenantId,
          companyId,
          assignment.branchId,
          assignment.staffId,
          assignmentId,
          targetStaffId,
          note.trim() || null,
          actor,
        );
        return inserted[0];
      } catch (error: unknown) {
        if (isUniqueViolation(error)) {
          throw new ConflictException(
            'An active swap request already exists for this assignment.',
          );
        }
        throw error;
      }
    });
  }

  async acceptSwap(
    id: string,
    targetAssignmentId: string | null,
    note: string,
    actor: string,
  ) {
    const { tenantId, companyId } = this.scope();
    const branches = await this.branches();
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRawUnsafe<
        Array<{ id: string; target_staff_id: string | null }>
      >(
        `SELECT id,target_staff_id FROM hr_shift_swap_requests WHERE id=$1 AND tenant_id=$2 AND company_id=$3 AND status='OPEN' AND ($4::text[] IS NULL OR branch_id=ANY($4::text[])) FOR UPDATE`,
        id,
        tenantId,
        companyId,
        branches,
      );
      const request = rows[0];
      if (!request) throw new NotFoundException('Open swap request not found.');
      if (!request.target_staff_id) {
        throw new BadRequestException(
          'A target staff member is required before acceptance.',
        );
      }

      if (targetAssignmentId) {
        const targetAssignments = await tx.$queryRawUnsafe<Array<{ id: string }>>(
          `SELECT a.id FROM hr_shift_assignments a JOIN hr_scheduled_shifts sh ON sh.id=a.scheduled_shift_id WHERE a.id=$1 AND a.tenant_id=$2 AND a.company_id=$3 AND a.staff_id=$4 AND a.status IN('ASSIGNED','CONFIRMED') FOR UPDATE OF a`,
          targetAssignmentId,
          tenantId,
          companyId,
          request.target_staff_id,
        );
        if (!targetAssignments.length) {
          throw new NotFoundException('Target assignment not found.');
        }
      }

      await tx.$executeRawUnsafe(
        `UPDATE hr_shift_swap_requests SET target_assignment_id=$1,status='ACCEPTED',target_note=$2,accepted_at=CURRENT_TIMESTAMP,accepted_by=$3,updated_at=CURRENT_TIMESTAMP WHERE id=$4`,
        targetAssignmentId,
        note.trim() || null,
        actor,
        id,
      );
      return { id, status: 'ACCEPTED' };
    });
  }

  async reviewSwap(id: string, approve: boolean, note: string, actor: string) {
    const { tenantId, companyId } = this.scope();
    const branches = await this.branches();
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRawUnsafe<SwapRequestRow[]>(
        `SELECT r.*,a.scheduled_shift_id AS "requesterShiftId",sh.starts_at AS "startsAt",sh.ends_at AS "endsAt" FROM hr_shift_swap_requests r JOIN hr_shift_assignments a ON a.id=r.requester_assignment_id JOIN hr_scheduled_shifts sh ON sh.id=a.scheduled_shift_id WHERE r.id=$1 AND r.tenant_id=$2 AND r.company_id=$3 AND r.status='ACCEPTED' AND ($4::text[] IS NULL OR r.branch_id=ANY($4::text[])) FOR UPDATE OF r,a`,
        id,
        tenantId,
        companyId,
        branches,
      );
      const request = rows[0];
      if (!request) throw new NotFoundException('Accepted swap request not found.');

      if (!approve) {
        await tx.$executeRawUnsafe(
          `UPDATE hr_shift_swap_requests SET status='REJECTED',manager_note=$1,reviewed_at=CURRENT_TIMESTAMP,reviewed_by=$2,updated_at=CURRENT_TIMESTAMP WHERE id=$3`,
          note.trim() || null,
          actor,
          id,
        );
        return { id, status: 'REJECTED' };
      }

      await this.eligible(
        tx,
        tenantId,
        companyId,
        request.branch_id,
        request.target_staff_id,
        request,
        request.target_assignment_id ?? undefined,
      );
      await tx.$executeRawUnsafe(
        `UPDATE hr_shift_assignments SET staff_id=$1,source='SHIFT_SWAP',assigned_by=$2,assigned_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=$3`,
        request.target_staff_id,
        actor,
        request.requester_assignment_id,
      );
      if (request.target_assignment_id) {
        await tx.$executeRawUnsafe(
          `UPDATE hr_shift_assignments SET staff_id=$1,source='SHIFT_SWAP',assigned_by=$2,assigned_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=$3`,
          request.requester_staff_id,
          actor,
          request.target_assignment_id,
        );
      }
      await tx.$executeRawUnsafe(
        `UPDATE hr_shift_swap_requests SET status='APPROVED',manager_note=$1,reviewed_at=CURRENT_TIMESTAMP,reviewed_by=$2,updated_at=CURRENT_TIMESTAMP WHERE id=$3`,
        note.trim() || null,
        actor,
        id,
      );
      return { id, status: 'APPROVED' };
    });
  }

  async bid(shiftId: string, staffId: string, note: string) {
    const { tenantId, companyId } = this.scope();
    const branches = await this.branches();
    return this.prisma.$transaction(async (tx) => {
      const shifts = await tx.$queryRawUnsafe<
        Array<
          ShiftWindow & {
            id: string;
            branchId: string;
            status: string;
            openSlots: number;
          }
        >
      >(
        `SELECT id,branch_id AS "branchId",starts_at AS "startsAt",ends_at AS "endsAt",status,open_slots AS "openSlots" FROM hr_scheduled_shifts WHERE id=$1 AND tenant_id=$2 AND company_id=$3 AND status='PUBLISHED' AND open_slots>0 AND ($4::text[] IS NULL OR branch_id=ANY($4::text[])) FOR UPDATE`,
        shiftId,
        tenantId,
        companyId,
        branches,
      );
      const shift = shifts[0];
      if (!shift) throw new NotFoundException('Open shift not found.');
      await this.eligible(tx, tenantId, companyId, shift.branchId, staffId, shift);

      try {
        const inserted = await tx.$queryRawUnsafe<Array<{ id: string; status: string }>>(
          `INSERT INTO hr_open_shift_bids(id,tenant_id,company_id,branch_id,scheduled_shift_id,staff_id,note) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,status`,
          randomUUID(),
          tenantId,
          companyId,
          shift.branchId,
          shiftId,
          staffId,
          note.trim() || null,
        );
        return inserted[0];
      } catch (error: unknown) {
        if (isUniqueViolation(error)) {
          throw new ConflictException('Staff already has a pending bid for this shift.');
        }
        throw error;
      }
    });
  }

  async reviewBid(id: string, approve: boolean, actor: string) {
    const { tenantId, companyId } = this.scope();
    const branches = await this.branches();
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRawUnsafe<OpenBidRow[]>(
        `SELECT b.*,sh.starts_at AS "startsAt",sh.ends_at AS "endsAt",sh.open_slots AS "openSlots",sh.status AS "shiftStatus" FROM hr_open_shift_bids b JOIN hr_scheduled_shifts sh ON sh.id=b.scheduled_shift_id WHERE b.id=$1 AND b.tenant_id=$2 AND b.company_id=$3 AND b.status='PENDING' AND ($4::text[] IS NULL OR b.branch_id=ANY($4::text[])) FOR UPDATE OF b,sh`,
        id,
        tenantId,
        companyId,
        branches,
      );
      const bid = rows[0];
      if (!bid) throw new NotFoundException('Pending open shift bid not found.');

      if (!approve) {
        await tx.$executeRawUnsafe(
          `UPDATE hr_open_shift_bids SET status='REJECTED',reviewed_at=CURRENT_TIMESTAMP,reviewed_by=$1,updated_at=CURRENT_TIMESTAMP WHERE id=$2`,
          actor,
          id,
        );
        return { id, status: 'REJECTED' };
      }

      if (bid.shiftStatus !== 'PUBLISHED' || Number(bid.openSlots) <= 0) {
        throw new ConflictException('Shift no longer has open capacity.');
      }
      await this.eligible(
        tx,
        tenantId,
        companyId,
        bid.branch_id,
        bid.staff_id,
        bid,
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO hr_shift_assignments(id,tenant_id,company_id,branch_id,scheduled_shift_id,staff_id,status,source,assigned_by) VALUES($1,$2,$3,$4,$5,$6,'ASSIGNED','OPEN_SHIFT',$7)`,
        randomUUID(),
        tenantId,
        companyId,
        bid.branch_id,
        bid.scheduled_shift_id,
        bid.staff_id,
        actor,
      );
      await tx.$executeRawUnsafe(
        `UPDATE hr_scheduled_shifts SET open_slots=open_slots-1,updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
        bid.scheduled_shift_id,
      );
      await tx.$executeRawUnsafe(
        `UPDATE hr_open_shift_bids SET status='APPROVED',reviewed_at=CURRENT_TIMESTAMP,reviewed_by=$1,updated_at=CURRENT_TIMESTAMP WHERE id=$2`,
        actor,
        id,
      );
      return { id, status: 'APPROVED' };
    });
  }
}
