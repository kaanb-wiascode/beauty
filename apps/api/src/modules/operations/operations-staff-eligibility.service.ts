import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';

import { TenantContext } from '../../common/tenant/tenant-context';
import { SkillBasedSchedulingService } from '../hr/skill-based-scheduling.service';
import type {
  StaffEligibilityCheckInput,
  UpdateStaffEligibilityPolicyInput,
} from './dto/staff-eligibility.dto';

type PolicyRow = {
  id: string;
  mode: 'OFF' | 'WARN' | 'BLOCK';
  requirePublishedShift: boolean;
  requireServiceCertification: boolean;
  requireCompetency: boolean;
  version: number;
};

@Injectable()
export class OperationsStaffEligibilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
    private readonly hrScheduling: SkillBasedSchedulingService,
  ) {}

  private context() {
    const tenantId = this.tenantContext.getTenantId();
    const companyId = this.tenantContext.getCompanyId();
    const branchId = this.tenantContext.getBranchId();
    if (!tenantId || !companyId) {
      throw new InternalServerErrorException('Organization context is incomplete.');
    }
    if (!branchId) {
      throw new BadRequestException('A branch must be selected for this operation.');
    }
    return { tenantId, companyId, branchId };
  }

  async policy() {
    const { tenantId, companyId, branchId } = this.context();
    const rows = await this.prisma.$queryRawUnsafe<PolicyRow[]>(
      `SELECT id, mode,
              require_published_shift AS "requirePublishedShift",
              require_service_certification AS "requireServiceCertification",
              require_competency AS "requireCompetency",
              version
       FROM operations_staff_eligibility_policies
       WHERE tenant_id=$1 AND company_id=$2 AND branch_id=$3
       LIMIT 1`,
      tenantId,
      companyId,
      branchId,
    );
    return rows[0] ?? {
      id: null,
      mode: 'WARN' as const,
      requirePublishedShift: true,
      requireServiceCertification: true,
      requireCompetency: true,
      version: 0,
      inheritedDefault: true,
    };
  }

  async updatePolicy(input: UpdateStaffEligibilityPolicyInput) {
    const { tenantId, companyId, branchId } = this.context();
    const current = await this.policy();
    if (current.version > 0 && input.expectedVersion !== current.version) {
      throw new ConflictException('Eligibility policy changed since it was read. Refresh and retry.');
    }
    if (current.version === 0) {
      const rows = await this.prisma.$queryRawUnsafe<PolicyRow[]>(
        `INSERT INTO operations_staff_eligibility_policies(
           tenant_id,company_id,branch_id,mode,require_published_shift,
           require_service_certification,require_competency
         ) VALUES($1,$2,$3,$4,$5,$6,$7)
         RETURNING id,mode,
           require_published_shift AS "requirePublishedShift",
           require_service_certification AS "requireServiceCertification",
           require_competency AS "requireCompetency",version`,
        tenantId,
        companyId,
        branchId,
        input.mode,
        input.requirePublishedShift,
        input.requireServiceCertification,
        input.requireCompetency,
      );
      return rows[0];
    }
    const rows = await this.prisma.$queryRawUnsafe<PolicyRow[]>(
      `UPDATE operations_staff_eligibility_policies
       SET mode=$4, require_published_shift=$5,
           require_service_certification=$6, require_competency=$7,
           version=version+1, updated_at=CURRENT_TIMESTAMP
       WHERE tenant_id=$1 AND company_id=$2 AND branch_id=$3 AND version=$8
       RETURNING id,mode,
         require_published_shift AS "requirePublishedShift",
         require_service_certification AS "requireServiceCertification",
         require_competency AS "requireCompetency",version`,
      tenantId,
      companyId,
      branchId,
      input.mode,
      input.requirePublishedShift,
      input.requireServiceCertification,
      input.requireCompetency,
      input.expectedVersion,
    );
    if (!rows[0]) throw new ConflictException('Eligibility policy changed during update.');
    return rows[0];
  }

  async check(input: StaffEligibilityCheckInput, options?: { ignoreAppointmentConflict?: boolean }) {
    const policy = await this.policy();
    if (policy.mode === 'OFF') {
      return { allowed: true, mode: policy.mode, blockers: [], warnings: [], policy, hr: null };
    }

    const hr = await this.hrScheduling.eligibility(
      input.staffId,
      input.serviceId,
      input.startAt.toISOString(),
      input.endAt.toISOString(),
    );

    const blockers: Array<{ code: string; message: string }> = [];
    const add = (code: string, message: string) => blockers.push({ code, message });

    if (policy.requirePublishedShift && !hr.checks.scheduledShift) {
      add('STAFF_OUTSIDE_PUBLISHED_SHIFT', 'Personel seçilen zaman aralığını kapsayan yayınlanmış bir vardiyaya atanmamış.');
    }
    if (!hr.checks.leaveClear) {
      add('STAFF_ON_APPROVED_LEAVE', 'Personel seçilen zaman aralığında onaylı izinde.');
    }
    if (!options?.ignoreAppointmentConflict && !hr.checks.appointmentClear) {
      add('STAFF_APPOINTMENT_CONFLICT', 'Personelin seçilen zaman aralığında başka bir randevusu var.');
    }
    if (policy.requireServiceCertification && !hr.checks.certification) {
      add('STAFF_CERTIFICATION_MISSING', 'Hizmet için zorunlu geçerli sertifika bulunmuyor.');
    }
    if (policy.requireCompetency && !hr.checks.competency) {
      add('STAFF_COMPETENCY_GAP', 'Hizmet/vardiya için zorunlu yetkinlik seviyesi karşılanmıyor.');
    }
    if (policy.requireCompetency && !hr.checks.position) {
      add('STAFF_POSITION_MISSING', 'Personelin geçerli pozisyon ataması bulunmuyor; yetkinlik uygunluğu doğrulanamıyor.');
    }

    const allowed = policy.mode !== 'BLOCK' || blockers.length === 0;
    return {
      allowed,
      mode: policy.mode,
      blockers: policy.mode === 'BLOCK' ? blockers : [],
      warnings: policy.mode === 'WARN' ? blockers : [],
      policy,
      hr: {
        checks: hr.checks,
        missingCompetencies: hr.missingCompetencies,
        missingCertifications: hr.certification.missing,
      },
    };
  }

  async assertWaitlistEntryEligible(
    entryId: string,
    input: { staffId: string; startAt: Date; endAt: Date },
  ) {
    const { tenantId, companyId, branchId } = this.context();
    const rows = await this.prisma.$queryRawUnsafe<Array<{ serviceId: string }>>(
      `SELECT service_id AS "serviceId"
       FROM operations_waitlist_entries
       WHERE id=$1 AND tenant_id=$2 AND company_id=$3 AND branch_id=$4
       LIMIT 1`,
      entryId,
      tenantId,
      companyId,
      branchId,
    );
    if (!rows[0]) throw new NotFoundException('Waitlist entry not found.');
    const result = await this.check({ ...input, serviceId: rows[0].serviceId });
    if (!result.allowed) {
      throw new ConflictException({
        code: 'STAFF_ELIGIBILITY_BLOCKED',
        message: 'Selected staff does not satisfy the active Operations eligibility policy.',
        blockers: result.blockers,
      });
    }
    return result;
  }

  async assertAppointmentExecutionEligible(appointmentId: string) {
    const { tenantId, branchId } = this.context();
    const appointment = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, tenantId, branchId },
      select: { id: true, staffId: true, serviceId: true, startAt: true, endAt: true },
    });
    if (!appointment) throw new NotFoundException('Appointment not found.');
    const result = await this.check(
      {
        staffId: appointment.staffId,
        serviceId: appointment.serviceId,
        startAt: appointment.startAt,
        endAt: appointment.endAt,
      },
      { ignoreAppointmentConflict: true },
    );
    if (!result.allowed) {
      throw new ConflictException({
        code: 'STAFF_ELIGIBILITY_BLOCKED',
        message: 'Service execution cannot start because staff eligibility policy is not satisfied.',
        blockers: result.blockers,
      });
    }
    return result;
  }
}
