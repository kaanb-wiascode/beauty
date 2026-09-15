import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { OrganizationScopeService } from '../../common/tenant/organization-scope.service';
import { TenantContext } from '../../common/tenant/tenant-context';
import { randomUUID } from 'crypto';

@Injectable()
export class AttendanceHardeningService {
  constructor(private readonly prisma: PrismaService, private readonly tenantContext: TenantContext, private readonly organizationScope: OrganizationScopeService) {}

  private async scope() {
    const tenantId = this.tenantContext.getTenantId();
    const companyId = this.tenantContext.getCompanyId();
    if (!tenantId || !companyId) throw new BadRequestException('Tenant and company context are required.');
    const scoped = await this.organizationScope.getBranchScopedWhere();
    const branchIds = 'branchId' in scoped ? (typeof scoped.branchId === 'string' ? [scoped.branchId] : scoped.branchId.in) : null;
    return { tenantId, companyId, branchIds };
  }

  async exceptions(from: string, to: string) {
    if (!from || !to || Number.isNaN(Date.parse(from)) || Number.isNaN(Date.parse(to)) || from > to) throw new BadRequestException('A valid from/to date range is required.');
    const s = await this.scope();
    return this.prisma.$queryRawUnsafe<any[]>(`SELECT a.id,a.staff_id AS "staffId",st."firstName",st."lastName",a.work_date::text AS "date",a.status,a.check_in AS "checkIn",a.check_out AS "checkOut",a.scheduled_shift_id AS "scheduledShiftId",a.late_minutes AS "lateMinutes",a.early_departure_minutes AS "earlyDepartureMinutes",a.missing_punch AS "missingPunch",a.absence,a.holiday_work AS "holidayWork",a.weekly_rest_work AS "weeklyRestWork",a.exception_status AS "exceptionStatus" FROM attendance_records a JOIN staff st ON st.id=a.staff_id JOIN branches b ON b.id=a.branch_id WHERE a.tenant_id=$1 AND b."companyId"=$2 AND ($3::text[] IS NULL OR a.branch_id=ANY($3::text[])) AND a.work_date BETWEEN $4::date AND $5::date AND a.exception_status<>'NONE' ORDER BY a.work_date DESC,st."firstName"`,s.tenantId,s.companyId,s.branchIds,from,to);
  }

  async reconcile(from: string, to: string) {
    if (!from || !to || Number.isNaN(Date.parse(from)) || Number.isNaN(Date.parse(to)) || from > to) throw new BadRequestException('A valid from/to date range is required.');
    const s = await this.scope();
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`SELECT a.id,a.check_in AS "checkIn",a.check_out AS "checkOut",sh.id AS "shiftId",sh.starts_at AS "startsAt",sh.ends_at AS "endsAt" FROM attendance_records a JOIN branches b ON b.id=a.branch_id LEFT JOIN hr_shift_assignments sa ON sa.staff_id=a.staff_id AND sa.status IN ('ASSIGNED','CONFIRMED','COMPLETED') LEFT JOIN hr_scheduled_shifts sh ON sh.id=sa.scheduled_shift_id AND sh.shift_date=a.work_date AND sh.status IN ('PUBLISHED','COMPLETED') WHERE a.tenant_id=$1 AND b."companyId"=$2 AND ($3::text[] IS NULL OR a.branch_id=ANY($3::text[])) AND a.work_date BETWEEN $4::date AND $5::date`,s.tenantId,s.companyId,s.branchIds,from,to);
    let updated=0;
    for (const r of rows) {
      const missing=Boolean(r.shiftId)&&(!r.checkIn||!r.checkOut);
      const late=r.shiftId&&r.checkIn?Math.max(0,Math.floor((new Date(r.checkIn).getTime()-new Date(r.startsAt).getTime())/60000)):0;
      const early=r.shiftId&&r.checkOut?Math.max(0,Math.floor((new Date(r.endsAt).getTime()-new Date(r.checkOut).getTime())/60000)):0;
      const absence=Boolean(r.shiftId)&&!r.checkIn&&!r.checkOut;
      const exception=missing||late>0||early>0||absence?'OPEN':'NONE';
      await this.prisma.$executeRawUnsafe(`UPDATE attendance_records SET scheduled_shift_id=$1,late_minutes=$2,early_departure_minutes=$3,missing_punch=$4,absence=$5,exception_status=CASE WHEN exception_status IN ('CORRECTED','WAIVED') THEN exception_status ELSE $6 END,updated_at=CURRENT_TIMESTAMP WHERE id=$7 AND tenant_id=$8`,r.shiftId??null,late,early,missing,absence,exception,r.id,s.tenantId);
      updated++;
    }
    return { processed: rows.length, updated };
  }

  async correct(id: string, body: any, actorId: string) {
    const reason=String(body.reason??'').trim();
    if (!reason) throw new BadRequestException('Correction reason is required.');
    const s=await this.scope();
    return this.prisma.$transaction(async tx=>{
      const rows=await tx.$queryRawUnsafe<any[]>(`SELECT a.* FROM attendance_records a JOIN branches b ON b.id=a.branch_id WHERE a.id=$1 AND a.tenant_id=$2 AND b."companyId"=$3 AND ($4::text[] IS NULL OR a.branch_id=ANY($4::text[])) FOR UPDATE`,id,s.tenantId,s.companyId,s.branchIds);
      const current=rows[0]; if(!current) throw new NotFoundException('Attendance record not found.');
      const next={checkIn:body.checkIn??current.check_in,checkOut:body.checkOut??current.check_out,status:body.status??current.status,note:body.note??current.note};
      await tx.$executeRawUnsafe(`UPDATE attendance_records SET check_in=$1,check_out=$2,status=$3,note=$4,exception_status='CORRECTED',updated_at=CURRENT_TIMESTAMP WHERE id=$5`,next.checkIn,next.checkOut,next.status,next.note,id);
      await tx.$executeRawUnsafe(`INSERT INTO hr_attendance_corrections(id,tenant_id,company_id,branch_id,attendance_record_id,staff_id,reason,previous_value,new_value,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10)`,randomUUID(),s.tenantId,s.companyId,current.branch_id,id,current.staff_id,reason,JSON.stringify({checkIn:current.check_in,checkOut:current.check_out,status:current.status,note:current.note}),JSON.stringify(next),actorId);
      return { id, exceptionStatus:'CORRECTED' };
    });
  }
}
