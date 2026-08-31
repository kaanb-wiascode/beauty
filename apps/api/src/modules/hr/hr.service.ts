import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

type StaffProfile = Record<string, unknown>;

@Injectable()
export class HrService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  private requireBranchId(): string {
    const branchId = this.tenantContext.getBranchId();
    if (!branchId) {
      throw new BadRequestException('A branch must be selected for this operation.');
    }
    return branchId;
  }

  private getScope() {
    const tenantId = this.tenantContext.getTenantId();
    const companyId = this.tenantContext.getCompanyId();
    const branchId = this.tenantContext.getBranchId();
    const roleScope = this.tenantContext.getRoleScope();

    if (roleScope === 'CENTRAL' && branchId === null) {
      return { tenantId, branch: { companyId } };
    }

    return { tenantId, branchId: this.requireBranchId() };
  }

  private profile(value: unknown): StaffProfile {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return value as StaffProfile;
  }

  async attendance() {
    const scope = this.getScope();
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    const to = new Date();
    to.setHours(23, 59, 59, 999);

    const [staff, appointments] = await Promise.all([
      this.prisma.staff.findMany({
        where: scope,
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
        select: { id: true, firstName: true, lastName: true, status: true, branchId: true },
      }),
      this.prisma.appointment.findMany({
        where: { ...scope, startAt: { gte: from, lte: to } },
        orderBy: { startAt: 'asc' },
        select: { id: true, staffId: true, startAt: true, endAt: true, status: true },
      }),
    ]);

    return {
      data: staff.map((member) => {
        const dayAppointments = appointments.filter((item) => item.staffId === member.id);
        const completed = dayAppointments.filter((item) => item.status === 'COMPLETED').length;
        return {
          id: member.id,
          employee: `${member.firstName} ${member.lastName}`,
          status: member.status,
          branchId: member.branchId,
          appointmentCount: dayAppointments.length,
          completedAppointments: completed,
          firstAppointmentAt: dayAppointments[0]?.startAt ?? null,
          lastAppointmentAt: dayAppointments.at(-1)?.endAt ?? null,
          attendanceSource: 'APPOINTMENTS',
        };
      }),
      meta: {
        date: from.toISOString().slice(0, 10),
        note: 'Puantaj kaydı henüz ayrı bir veri modeli olmadığı için bugünkü çalışma özeti randevu kayıtlarından hesaplanır.',
      },
    };
  }

  async leaves() {
    const scope = this.getScope();
    const staff = await this.prisma.staff.findMany({
      where: scope,
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      select: { id: true, firstName: true, lastName: true, status: true, profile: true },
    });

    return {
      data: staff.map((member) => {
        const profile = this.profile(member.profile);
        const annualEntitlement = Number(profile.annualLeaveDays ?? 0);
        const used = Number(profile.usedLeaveDays ?? 0);
        const pending = Number(profile.pendingLeaveDays ?? 0);
        return {
          id: member.id,
          employee: `${member.firstName} ${member.lastName}`,
          status: member.status,
          annualEntitlement,
          usedLeaveDays: used,
          pendingLeaveDays: pending,
          remainingLeaveDays: Math.max(annualEntitlement - used, 0),
          leaveDataConfigured: annualEntitlement > 0 || used > 0 || pending > 0,
        };
      }),
      meta: {
        note: 'İzin kayıtları henüz ayrı bir tabloya taşınmadı; mevcut personel profilindeki izin alanları okunur.',
      },
    };
  }

  async payroll() {
    const scope = this.getScope();
    const staff = await this.prisma.staff.findMany({
      where: scope,
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      select: { id: true, firstName: true, lastName: true, status: true, profile: true },
    });

    const rows = staff.map((member) => {
      const profile = this.profile(member.profile);
      const salary = Number(profile.salary ?? 0);
      const salaryType = typeof profile.salaryType === 'string' ? profile.salaryType : null;
      const configured = salary > 0;
      return {
        id: member.id,
        employee: `${member.firstName} ${member.lastName}`,
        status: member.status,
        salaryType,
        grossBase: salary,
        currency: 'TRY',
        configured,
        payrollStatus: configured ? 'READY_FOR_CALCULATION' : 'NOT_CONFIGURED',
        note: configured
          ? 'Bu tutar personel profilindeki ücret tabanıdır; vergi/SGK/kesinti hesabı yapılmamıştır.'
          : 'Personel profilinde ücret tanımlanmamış.',
      };
    });

    return {
      data: rows,
      summary: {
        employeeCount: rows.filter((row) => row.status === 'ACTIVE').length,
        configuredCount: rows.filter((row) => row.configured).length,
        grossBaseTotal: rows.reduce((sum, row) => sum + row.grossBase, 0),
        currency: 'TRY',
      },
    };
  }
}
