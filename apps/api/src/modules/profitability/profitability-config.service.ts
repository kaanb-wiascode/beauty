import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

@Injectable()
export class ProfitabilityConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  private context() {
    const branchId = this.tenantContext.getBranchId();
    if (!branchId) throw new BadRequestException('A branch must be selected for this operation.');
    return {
      tenantId: this.tenantContext.getTenantId(),
      branchId,
    };
  }

  async setStaffCommission(staffId: string, rateInput: number) {
    const { tenantId, branchId } = this.context();
    const rate = Math.round((Number(rateInput) + Number.EPSILON) * 100) / 100;
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      throw new BadRequestException('Commission rate must be between 0 and 100.');
    }

    const staff = await this.prisma.staff.findFirst({
      where: { id: staffId, tenantId, branchId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!staff) throw new NotFoundException('Staff not found');

    await this.prisma.$executeRawUnsafe(
      `INSERT INTO staff_commission_rates(staff_id,tenant_id,branch_id,rate,updated_at)
       VALUES($1::text,$2::text,$3::text,$4,NOW())
       ON CONFLICT(staff_id)
       DO UPDATE SET tenant_id=EXCLUDED.tenant_id,branch_id=EXCLUDED.branch_id,rate=EXCLUDED.rate,updated_at=NOW()`,
      staffId,
      tenantId,
      branchId,
      rate,
    );

    return { staffId, rate };
  }

  async attributeSaleItem(saleItemId: string, appointmentId: string) {
    const { tenantId, branchId } = this.context();

    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRawUnsafe<any[]>(
        `SELECT si.id,si.type,si."serviceId",s."customerId",s."branchId"
         FROM sale_items si
         JOIN sales s ON s.id=si."saleId"
         WHERE si.id=$1::text AND s."tenantId"=$2::text AND s."branchId"=$3::text AND s.status='CONFIRMED'
         LIMIT 1`,
        saleItemId,
        tenantId,
        branchId,
      );
      if (!rows.length) throw new NotFoundException('Confirmed sale item not found');
      const saleItem = rows[0];
      if (saleItem.type !== 'SERVICE' || !saleItem.serviceId) {
        throw new BadRequestException('Only service sale items can be attributed to appointments.');
      }

      const appointments = await tx.$queryRawUnsafe<any[]>(
        `SELECT a.id,a."staffId",a."serviceId",a."customerId",a."branchId"
         FROM appointments a
         WHERE a.id=$1::text AND a."tenantId"=$2::text AND a."branchId"=$3::text
         LIMIT 1`,
        appointmentId,
        tenantId,
        branchId,
      );
      if (!appointments.length) throw new NotFoundException('Appointment not found');
      const appointment = appointments[0];
      if (appointment.customerId !== saleItem.customerId) {
        throw new BadRequestException('Sale item and appointment must belong to the same customer.');
      }
      if (appointment.serviceId !== saleItem.serviceId) {
        throw new BadRequestException('Sale item and appointment service must match.');
      }

      const rates = await tx.$queryRawUnsafe<Array<{ rate: Prisma.Decimal }>>(
        `SELECT rate FROM staff_commission_rates WHERE staff_id=$1::text AND tenant_id=$2::text AND branch_id=$3::text LIMIT 1`,
        appointment.staffId,
        tenantId,
        branchId,
      );
      const rate = Number(rates[0]?.rate ?? 0);

      try {
        await tx.$executeRawUnsafe(
          `INSERT INTO sale_item_attributions(
             sale_item_id,tenant_id,branch_id,appointment_id,staff_id,commission_rate_snapshot,created_at,updated_at
           ) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6,NOW(),NOW())
           ON CONFLICT(sale_item_id)
           DO UPDATE SET appointment_id=EXCLUDED.appointment_id,staff_id=EXCLUDED.staff_id,
                         commission_rate_snapshot=EXCLUDED.commission_rate_snapshot,updated_at=NOW()`,
          saleItemId,
          tenantId,
          branchId,
          appointmentId,
          appointment.staffId,
          rate,
        );
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2010') {
          throw new BadRequestException('This appointment is already attributed to another sale item.');
        }
        throw error;
      }

      return {
        saleItemId,
        appointmentId,
        staffId: appointment.staffId,
        commissionRateSnapshot: rate,
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}
