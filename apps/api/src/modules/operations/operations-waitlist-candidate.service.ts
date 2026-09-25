import { BadRequestException, ConflictException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import type { FindWaitlistMatchesInput } from './dto/waitlist.dto';
import { OperationsBranchWorkingHoursService } from './operations-branch-working-hours.service';
import { OperationsStaffEligibilityService } from './operations-staff-eligibility.service';

type Target = {
  id: string;
  serviceId: string;
  preferredStaffId: string | null;
  desiredFrom: Date;
  desiredTo: Date;
  preferredTimeStart: string | null;
  preferredTimeEnd: string | null;
  timeZone: string;
  status: string;
  expiresAt: Date | null;
  version: number;
  durationMinutes: number;
  roomType: string | null;
  requiredAssetType: string | null;
  requiredAssetId: string | null;
  prepDurationMinutes: number;
  cleanupDurationMinutes: number;
};

type Candidate = {
  staffId: string;
  staffName: string;
  startAt: Date;
  endAt: Date;
  blockedFrom: Date;
  blockedTo: Date;
  roomId: string | null;
  roomName: string | null;
  assetId: string | null;
  assetName: string | null;
};

@Injectable()
export class OperationsWaitlistCandidateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
    private readonly eligibility: OperationsStaffEligibilityService,
    private readonly workingHours: OperationsBranchWorkingHoursService,
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

  async findMatches(entryId: string, input: FindWaitlistMatchesInput) {
    const { tenantId, companyId, branchId, membershipId } = this.context();
    const target = await this.requireTarget(entryId, tenantId, companyId, branchId);
    this.assertMatchable(target);
    const scanFrom = this.ceilToQuarterHour(new Date(Math.max(Date.now(), target.desiredFrom.getTime())));
    if (scanFrom >= target.desiredTo) return { entryId, entryVersion: target.version, matches: [] };

    const scanLimit = Math.min(Math.max(input.limit * 5, input.limit), 250);
    const raw = await this.prisma.$queryRawUnsafe<Candidate[]>(
      `WITH slots AS (
         SELECT gs AS start_at,
                gs + ($7::int * INTERVAL '1 minute') AS end_at,
                gs - ($8::int * INTERVAL '1 minute') AS blocked_from,
                gs + (($7::int + $9::int) * INTERVAL '1 minute') AS blocked_to
         FROM generate_series($5::timestamptz,$6::timestamptz - ($7::int * INTERVAL '1 minute'),INTERVAL '15 minutes') gs
         WHERE ($10::time IS NULL OR (gs AT TIME ZONE $12)::time >= $10::time)
           AND ($11::time IS NULL OR ((gs + ($7::int * INTERVAL '1 minute')) AT TIME ZONE $12)::time <= $11::time)
       ), staff_candidates AS (
         SELECT st.id, trim(concat(st."firstName", ' ', st."lastName")) AS name
         FROM staff st
         WHERE st."tenantId"=$1 AND st."branchId"=$3 AND st.status::text='ACTIVE'
           AND ($4::text IS NULL OR st.id=$4)
       )
       SELECT sc.id AS "staffId",sc.name AS "staffName",sl.start_at AS "startAt",sl.end_at AS "endAt",
              sl.blocked_from AS "blockedFrom",sl.blocked_to AS "blockedTo",
              room.id AS "roomId",room.name AS "roomName",asset.id AS "assetId",asset.name AS "assetName"
       FROM slots sl CROSS JOIN staff_candidates sc
       LEFT JOIN LATERAL (
         SELECT r.id,r.name FROM operations_rooms r
         WHERE $13::text IS NOT NULL AND r.tenant_id=$1 AND r.company_id=$2 AND r.branch_id=$3
           AND r.status='AVAILABLE' AND r.room_type=$13
           AND NOT EXISTS(SELECT 1 FROM operations_resource_allocations ra WHERE ra.room_id=r.id AND ra.status='RESERVED' AND ra.blocked_from<sl.blocked_to AND ra.blocked_to>sl.blocked_from)
           AND NOT EXISTS(SELECT 1 FROM operations_resource_blocks rb WHERE rb.room_id=r.id AND rb.status='ACTIVE' AND rb.blocked_from<sl.blocked_to AND rb.blocked_to>sl.blocked_from)
         ORDER BY r.name,r.id LIMIT 1
       ) room ON TRUE
       LEFT JOIN LATERAL (
         SELECT a.id,a.name FROM inventory_assets a
         WHERE ($14::text IS NOT NULL OR $15::text IS NOT NULL) AND a.company_id=$2 AND a.status='ACTIVE'
           AND (a.branch_id=$3 OR a.branch_id IS NULL) AND ($15::text IS NULL OR a.id=$15) AND ($14::text IS NULL OR a.asset_type=$14)
           AND NOT EXISTS(SELECT 1 FROM operations_resource_allocations ra WHERE ra.inventory_asset_id=a.id AND ra.status='RESERVED' AND ra.blocked_from<sl.blocked_to AND ra.blocked_to>sl.blocked_from)
           AND NOT EXISTS(SELECT 1 FROM operations_resource_blocks rb WHERE rb.inventory_asset_id=a.id AND rb.status='ACTIVE' AND rb.blocked_from<sl.blocked_to AND rb.blocked_to>sl.blocked_from)
           AND NOT EXISTS(SELECT 1 FROM inventory_asset_maintenance m WHERE m.asset_id=a.id AND m.status IN('PLANNED','IN_PROGRESS') AND m.completed_at IS NULL AND (m.scheduled_at IS NULL OR m.scheduled_at<sl.blocked_to))
         ORDER BY CASE WHEN a.branch_id=$3 THEN 0 ELSE 1 END,a.name,a.id LIMIT 1
       ) asset ON TRUE
       WHERE NOT EXISTS(SELECT 1 FROM appointments ap WHERE ap."tenantId"=$1 AND ap."branchId"=$3 AND ap."staffId"=sc.id AND ap.status::text NOT IN('CANCELLED','NO_SHOW') AND ap."startAt"<sl.end_at AND ap."endAt">sl.start_at)
         AND NOT EXISTS(SELECT 1 FROM leave_requests lr WHERE lr.tenant_id=$1 AND lr.branch_id=$3 AND lr.staff_id=sc.id AND upper(lr.status)='APPROVED' AND lr.start_date<=(sl.end_at AT TIME ZONE 'UTC')::date AND lr.end_date>=(sl.start_at AT TIME ZONE 'UTC')::date)
         AND ($13::text IS NULL OR room.id IS NOT NULL)
         AND (($14::text IS NULL AND $15::text IS NULL) OR asset.id IS NOT NULL)
       ORDER BY sl.start_at,sc.name LIMIT $16`,
      tenantId, companyId, branchId, target.preferredStaffId, scanFrom, target.desiredTo,
      target.durationMinutes, target.prepDurationMinutes, target.cleanupDurationMinutes,
      target.preferredTimeStart, target.preferredTimeEnd, target.timeZone, target.roomType,
      target.requiredAssetType, target.requiredAssetId, scanLimit,
    );

    const matches: Array<Candidate & { eligibility: Awaited<ReturnType<OperationsStaffEligibilityService['check']>> }> = [];
    for (const candidate of raw) {
      if (matches.length >= input.limit) break;
      const hours = await this.workingHours.check({ startAt: candidate.startAt, endAt: candidate.endAt });
      if (!hours.allowed) continue;
      const eligibility = await this.eligibility.check({
        staffId: candidate.staffId,
        serviceId: target.serviceId,
        startAt: candidate.startAt,
        endAt: candidate.endAt,
      });
      if (!eligibility.allowed) continue;
      matches.push({ ...candidate, eligibility });
    }

    let entryVersion = target.version;
    if (matches[0] && target.status === 'WAITING') {
      const updated = await this.prisma.$queryRawUnsafe<Array<{ version: number }>>(
        `UPDATE operations_waitlist_entries SET status='MATCH_FOUND',matched_slot_from=$5,matched_slot_to=$6,version=version+1,updated_at=CURRENT_TIMESTAMP
         WHERE id=$1 AND tenant_id=$2 AND company_id=$3 AND branch_id=$4 AND status='WAITING' AND version=$7 RETURNING version`,
        entryId, tenantId, companyId, branchId, matches[0].startAt, matches[0].endAt, target.version,
      );
      if (updated[0]) {
        entryVersion = updated[0].version;
        await this.prisma.$executeRawUnsafe(
          `INSERT INTO operations_waitlist_events(waitlist_entry_id,tenant_id,branch_id,actor_membership_id,event_type,from_status,to_status,note)
           VALUES($1,$2,$3,$4,'MATCH_FOUND','WAITING','MATCH_FOUND',$5)`,
          entryId, tenantId, branchId, membershipId, `First policy-compatible slot: ${matches[0].startAt.toISOString()}`,
        );
      }
    }
    return { entryId, entryVersion, matches };
  }

  private async requireTarget(entryId: string, tenantId: string, companyId: string, branchId: string) {
    const rows = await this.prisma.$queryRawUnsafe<Target[]>(
      `SELECT w.id,w.service_id AS "serviceId",w.preferred_staff_id AS "preferredStaffId",w.desired_from AS "desiredFrom",w.desired_to AS "desiredTo",
              w.preferred_time_start::text AS "preferredTimeStart",w.preferred_time_end::text AS "preferredTimeEnd",w.time_zone AS "timeZone",w.status,w.expires_at AS "expiresAt",w.version,
              s."durationMinutes" AS "durationMinutes",req.room_type AS "roomType",req.required_asset_type AS "requiredAssetType",req.required_asset_id AS "requiredAssetId",
              COALESCE(req.prep_duration_minutes,0) AS "prepDurationMinutes",COALESCE(req.cleanup_duration_minutes,0) AS "cleanupDurationMinutes"
       FROM operations_waitlist_entries w JOIN services s ON s.id=w.service_id AND s."tenantId"=w.tenant_id AND s."branchId"=w.branch_id
       LEFT JOIN service_operational_requirements req ON req.service_id=w.service_id AND req.tenant_id=w.tenant_id AND req.branch_id=w.branch_id
       WHERE w.id=$1 AND w.tenant_id=$2 AND w.company_id=$3 AND w.branch_id=$4 LIMIT 1`,
      entryId, tenantId, companyId, branchId,
    );
    if (!rows[0]) throw new NotFoundException('Waitlist entry not found');
    return rows[0];
  }

  private assertMatchable(target: Target) {
    if (!['WAITING','MATCH_FOUND','CONTACTED'].includes(target.status)) throw new ConflictException(`Waitlist entry in ${target.status} state cannot be matched.`);
    if (target.expiresAt && target.expiresAt <= new Date()) throw new ConflictException('Waitlist entry has expired.');
  }

  private ceilToQuarterHour(value: Date) {
    const result = new Date(value);
    result.setSeconds(0,0);
    const remainder = result.getMinutes() % 15;
    if (remainder) result.setMinutes(result.getMinutes() + (15 - remainder));
    return result;
  }
}
