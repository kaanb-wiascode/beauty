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

  private validateRange(from:string,to:string){if(!from||!to||Number.isNaN(Date.parse(from))||Number.isNaN(Date.parse(to))||from>to)throw new BadRequestException('A valid from/to date range is required.');}

  async exceptions(from: string, to: string) {
    this.validateRange(from,to); const s = await this.scope();
    return this.prisma.$queryRawUnsafe<any[]>(`SELECT a.id,a.staff_id AS "staffId",st."firstName",st."lastName",a.work_date::text AS "date",a.status,a.check_in AS "checkIn",a.check_out AS "checkOut",a.scheduled_shift_id AS "scheduledShiftId",a.late_minutes AS "lateMinutes",a.early_departure_minutes AS "earlyDepartureMinutes",a.missing_punch AS "missingPunch",a.absence,a.holiday_work AS "holidayWork",a.weekly_rest_work AS "weeklyRestWork",a.exception_status AS "exceptionStatus" FROM attendance_records a JOIN staff st ON st.id=a.staff_id JOIN branches b ON b.id=a.branch_id WHERE a.tenant_id=$1 AND b."companyId"=$2 AND ($3::text[] IS NULL OR a.branch_id=ANY($3::text[])) AND a.work_date BETWEEN $4::date AND $5::date AND a.exception_status<>'NONE' ORDER BY a.work_date DESC,st."firstName"`,s.tenantId,s.companyId,s.branchIds,from,to);
  }

  async reconcile(from: string, to: string) {
    this.validateRange(from,to); const s=await this.scope();
    return this.prisma.$transaction(async tx=>{
      const scheduled=await tx.$queryRawUnsafe<any[]>(`SELECT sh.id AS "shiftId",sh.branch_id AS "branchId",sh.shift_date::text AS "workDate",sh.starts_at AS "startsAt",sh.ends_at AS "endsAt",sa.staff_id AS "staffId",a.id AS "attendanceId",a.check_in AS "checkIn",a.check_out AS "checkOut",a.exception_status AS "exceptionStatus" FROM hr_scheduled_shifts sh JOIN hr_shift_assignments sa ON sa.scheduled_shift_id=sh.id AND sa.status IN('ASSIGNED','CONFIRMED','COMPLETED') JOIN branches b ON b.id=sh.branch_id LEFT JOIN attendance_records a ON a.tenant_id=sh.tenant_id AND a.branch_id=sh.branch_id AND a.staff_id=sa.staff_id AND a.work_date=sh.shift_date WHERE sh.tenant_id=$1 AND sh.company_id=$2 AND b."companyId"=$2 AND sh.status IN('PUBLISHED','COMPLETED') AND sh.shift_date BETWEEN $4::date AND $5::date AND ($3::text[] IS NULL OR sh.branch_id=ANY($3::text[])) ORDER BY sh.shift_date,sa.staff_id,sh.starts_at`,s.tenantId,s.companyId,s.branchIds,from,to);
      const grouped=new Map<string,any[]>();for(const r of scheduled){const key=`${r.staffId}:${r.workDate}`;const list=grouped.get(key)??[];list.push(r);grouped.set(key,list)}
      let inserted=0,updated=0,ambiguous=0;
      for(const shifts of grouped.values()){
        const r=shifts[0];
        if(shifts.length>1){ambiguous++;if(r.attendanceId)await tx.$executeRawUnsafe(`UPDATE attendance_records SET scheduled_shift_id=NULL,exception_status=CASE WHEN exception_status IN('CORRECTED','WAIVED') THEN exception_status ELSE 'OPEN' END,note=COALESCE(note||' | ','')||'Multiple scheduled shifts require manual attendance review.',updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND tenant_id=$2`,r.attendanceId,s.tenantId);continue}
        if(!r.attendanceId){await tx.$executeRawUnsafe(`INSERT INTO attendance_records(id,tenant_id,branch_id,staff_id,work_date,status,worked_minutes,overtime_minutes,scheduled_shift_id,late_minutes,early_departure_minutes,missing_punch,absence,exception_status,note) VALUES($1,$2,$3,$4,$5::date,'ABSENT',0,0,$6,0,0,true,true,'OPEN','Generated from published scheduled shift with no attendance punches.') ON CONFLICT(staff_id,work_date) DO NOTHING`,randomUUID(),s.tenantId,r.branchId,r.staffId,r.workDate,r.shiftId);inserted++;continue}
        const metrics=await tx.$queryRawUnsafe<any[]>(`SELECT GREATEST(0,FLOOR(EXTRACT(EPOCH FROM ($1::timestamp-$2::timestamp))/60))::int AS late,GREATEST(0,FLOOR(EXTRACT(EPOCH FROM ($3::timestamp-$4::timestamp))/60))::int AS early`,r.checkIn??r.startsAt,r.startsAt,r.endsAt,r.checkOut??r.endsAt);const late=r.checkIn?Number(metrics[0].late):0,early=r.checkOut?Number(metrics[0].early):0,missing=!r.checkIn||!r.checkOut,absence=!r.checkIn&&!r.checkOut,exception=missing||late>0||early>0?'OPEN':'NONE';await tx.$executeRawUnsafe(`UPDATE attendance_records SET scheduled_shift_id=$1,late_minutes=$2,early_departure_minutes=$3,missing_punch=$4,absence=$5,status=CASE WHEN $5 THEN 'ABSENT' ELSE status END,exception_status=CASE WHEN exception_status IN('CORRECTED','WAIVED') THEN exception_status ELSE $6 END,updated_at=CURRENT_TIMESTAMP WHERE id=$7 AND tenant_id=$8`,r.shiftId,late,early,missing,absence,exception,r.attendanceId,s.tenantId);updated++
      }
      return{scheduledAssignments:scheduled.length,processedDays:grouped.size,insertedAbsences:inserted,updated,ambiguousMultipleShiftDays:ambiguous};
    });
  }

  async correct(id: string, body: any, actorId: string) {
    const reason=String(body.reason??'').trim(); if(!reason)throw new BadRequestException('Correction reason is required.'); const s=await this.scope();
    return this.prisma.$transaction(async tx=>{const rows=await tx.$queryRawUnsafe<any[]>(`SELECT a.* FROM attendance_records a JOIN branches b ON b.id=a.branch_id WHERE a.id=$1 AND a.tenant_id=$2 AND b."companyId"=$3 AND ($4::text[] IS NULL OR a.branch_id=ANY($4::text[])) FOR UPDATE`,id,s.tenantId,s.companyId,s.branchIds);const current=rows[0];if(!current)throw new NotFoundException('Attendance record not found.');const next={checkIn:body.checkIn??current.check_in,checkOut:body.checkOut??current.check_out,status:body.status??current.status,note:body.note??current.note};let late=current.late_minutes??0,early=current.early_departure_minutes??0,missing=!next.checkIn||!next.checkOut,absence=!next.checkIn&&!next.checkOut;if(current.scheduled_shift_id){const m=await tx.$queryRawUnsafe<any[]>(`SELECT CASE WHEN $1::timestamp IS NULL THEN 0 ELSE GREATEST(0,FLOOR(EXTRACT(EPOCH FROM ($1::timestamp-starts_at))/60))::int END AS late,CASE WHEN $2::timestamp IS NULL THEN 0 ELSE GREATEST(0,FLOOR(EXTRACT(EPOCH FROM (ends_at-$2::timestamp))/60))::int END AS early FROM hr_scheduled_shifts WHERE id=$3 AND tenant_id=$4`,next.checkIn,next.checkOut,current.scheduled_shift_id,s.tenantId);if(m.length){late=Number(m[0].late);early=Number(m[0].early)}}await tx.$executeRawUnsafe(`UPDATE attendance_records SET check_in=$1,check_out=$2,status=$3,note=$4,late_minutes=$5,early_departure_minutes=$6,missing_punch=$7,absence=$8,exception_status='CORRECTED',updated_at=CURRENT_TIMESTAMP WHERE id=$9`,next.checkIn,next.checkOut,next.status,next.note,late,early,missing,absence,id);await tx.$executeRawUnsafe(`INSERT INTO hr_attendance_corrections(id,tenant_id,company_id,branch_id,attendance_record_id,staff_id,reason,previous_value,new_value,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10)`,randomUUID(),s.tenantId,s.companyId,current.branch_id,id,current.staff_id,reason,JSON.stringify({checkIn:current.check_in,checkOut:current.check_out,status:current.status,note:current.note,lateMinutes:current.late_minutes,earlyDepartureMinutes:current.early_departure_minutes,missingPunch:current.missing_punch,absence:current.absence}),JSON.stringify({...next,lateMinutes:late,earlyDepartureMinutes:early,missingPunch:missing,absence}),actorId);return{id,exceptionStatus:'CORRECTED',lateMinutes:late,earlyDepartureMinutes:early,missingPunch:missing,absence}});
  }
}
