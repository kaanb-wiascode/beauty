import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';

import { TenantContext } from '../../common/tenant/tenant-context';

type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

type UpcomingAppointment = {
  appointmentId: string;
  customerId: string;
  customerName: string;
  staffId: string;
  staffName: string;
  serviceId: string;
  serviceName: string;
  startAt: Date;
  endAt: Date;
  confirmationStatus: string | null;
  customerAppointmentCount: number;
  customerNoShowCount: number;
  customerLateCancellationCount: number;
  historicalServiceCount: number;
  averageServiceOverrunMinutes: number;
  previousStaffAppointmentEndsAt: Date | null;
  activeResourceConflictCount: number;
};

@Injectable()
export class OperationsIntelligenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
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

  async overview(hours = 24) {
    const { tenantId, companyId, branchId } = this.context();
    const safeHours = Math.min(Math.max(hours, 1), 168);

    const rows = await this.prisma.$queryRawUnsafe<UpcomingAppointment[]>(
      `WITH upcoming AS (
         SELECT a.id, a."customerId", a."staffId", a."serviceId", a."startAt", a."endAt"
         FROM appointments a
         WHERE a."tenantId" = $1 AND a."branchId" = $3
           AND a.status::text IN ('SCHEDULED','CONFIRMED')
           AND a."startAt" >= CURRENT_TIMESTAMP
           AND a."startAt" < CURRENT_TIMESTAMP + ($4::int * INTERVAL '1 hour')
       ), customer_history AS (
         SELECT a."customerId",
                COUNT(*)::int AS appointment_count,
                COUNT(*) FILTER (WHERE a.status::text = 'NO_SHOW')::int AS no_show_count,
                COUNT(*) FILTER (
                  WHERE o.outcome = 'CANCELLED'
                    AND o.occurred_at >= a."startAt" - INTERVAL '24 hours'
                )::int AS late_cancellation_count
         FROM appointments a
         LEFT JOIN operations_appointment_outcomes o
           ON o.appointment_id = a.id AND o.tenant_id = $1 AND o.company_id = $2 AND o.branch_id = $3
         WHERE a."tenantId" = $1 AND a."branchId" = $3 AND a."startAt" < CURRENT_TIMESTAMP
         GROUP BY a."customerId"
       ), service_history AS (
         SELECT e.service_id,
                COUNT(*)::int AS service_count,
                COALESCE(AVG(GREATEST(0, EXTRACT(EPOCH FROM (e.completed_at - ap."endAt")) / 60)), 0)::float8 AS avg_overrun
         FROM operations_service_executions e
         JOIN appointments ap ON ap.id = e.appointment_id
         WHERE e.tenant_id = $1 AND e.company_id = $2 AND e.branch_id = $3
           AND e.status::text = 'COMPLETED' AND e.completed_at IS NOT NULL
           AND e.started_at >= CURRENT_TIMESTAMP - INTERVAL '180 days'
         GROUP BY e.service_id
       )
       SELECT u.id AS "appointmentId",
              u."customerId" AS "customerId",
              trim(concat(c."firstName", ' ', c."lastName")) AS "customerName",
              u."staffId" AS "staffId",
              trim(concat(st."firstName", ' ', st."lastName")) AS "staffName",
              u."serviceId" AS "serviceId",
              s.name AS "serviceName",
              u."startAt" AS "startAt",
              u."endAt" AS "endAt",
              eng.confirmation_status AS "confirmationStatus",
              COALESCE(ch.appointment_count, 0)::int AS "customerAppointmentCount",
              COALESCE(ch.no_show_count, 0)::int AS "customerNoShowCount",
              COALESCE(ch.late_cancellation_count, 0)::int AS "customerLateCancellationCount",
              COALESCE(sh.service_count, 0)::int AS "historicalServiceCount",
              COALESCE(sh.avg_overrun, 0)::float8 AS "averageServiceOverrunMinutes",
              prev."endAt" AS "previousStaffAppointmentEndsAt",
              (
                SELECT COUNT(*)::int
                FROM operations_resource_allocations ra
                JOIN operations_resource_blocks rb
                  ON rb.status = 'ACTIVE'
                 AND ((ra.room_id IS NOT NULL AND rb.room_id = ra.room_id)
                   OR (ra.inventory_asset_id IS NOT NULL AND rb.inventory_asset_id = ra.inventory_asset_id))
                 AND rb.blocked_from < ra.blocked_to
                 AND rb.blocked_to > ra.blocked_from
                WHERE ra.appointment_id = u.id
                  AND ra.tenant_id = $1 AND ra.company_id = $2 AND ra.branch_id = $3
                  AND ra.status = 'RESERVED'
              ) AS "activeResourceConflictCount"
       FROM upcoming u
       JOIN customers c ON c.id = u."customerId"
       JOIN staff st ON st.id = u."staffId"
       JOIN services s ON s.id = u."serviceId"
       LEFT JOIN customer_history ch ON ch."customerId" = u."customerId"
       LEFT JOIN service_history sh ON sh.service_id = u."serviceId"
       LEFT JOIN operations_appointment_engagement eng
         ON eng.appointment_id = u.id AND eng.tenant_id = $1 AND eng.company_id = $2 AND eng.branch_id = $3
       LEFT JOIN LATERAL (
         SELECT p."endAt"
         FROM appointments p
         WHERE p."tenantId" = $1 AND p."branchId" = $3 AND p."staffId" = u."staffId"
           AND p.id <> u.id AND p.status::text NOT IN ('CANCELLED','NO_SHOW')
           AND p."startAt" < u."startAt"
         ORDER BY p."startAt" DESC
         LIMIT 1
       ) prev ON TRUE
       ORDER BY u."startAt" ASC`,
      tenantId,
      companyId,
      branchId,
      safeHours,
    );

    const appointments = rows.map((row) => {
      const noShow = this.noShowRisk(row);
      const delay = this.delayRisk(row);
      return {
        ...row,
        noShowRisk: noShow,
        delayRisk: delay,
      };
    });

    const managerInsights = this.managerInsights(appointments);

    return {
      horizonHours: safeHours,
      model: 'EXPLAINABLE_HEURISTIC_V1',
      deterministicSchedulingRemainsAuthoritative: true,
      appointments,
      managerInsights,
    };
  }

  private noShowRisk(row: UpcomingAppointment) {
    let score = 0;
    const reasons: string[] = [];
    const denominator = Math.max(row.customerAppointmentCount, 1);
    const noShowRate = row.customerNoShowCount / denominator;

    if (row.customerNoShowCount >= 2 || noShowRate >= 0.25) {
      score += 45;
      reasons.push('Geçmiş randevularda yüksek no-show sinyali var.');
    } else if (row.customerNoShowCount === 1) {
      score += 25;
      reasons.push('Geçmişte en az bir no-show kaydı var.');
    }

    if (row.customerLateCancellationCount >= 2) {
      score += 25;
      reasons.push('Son dakika iptal geçmişi yüksek.');
    } else if (row.customerLateCancellationCount === 1) {
      score += 10;
      reasons.push('Geçmişte son dakika iptal kaydı var.');
    }

    if (!row.confirmationStatus || row.confirmationStatus === 'PENDING') {
      score += 20;
      reasons.push('Randevu henüz müşteri tarafından onaylanmadı.');
    } else if (row.confirmationStatus === 'CANCEL_REQUESTED') {
      score += 35;
      reasons.push('Müşteri iptal talebi bildirmiş.');
    } else if (row.confirmationStatus === 'RESCHEDULE_REQUESTED') {
      score += 25;
      reasons.push('Müşteri tarih değişikliği talebi bildirmiş.');
    } else if (row.confirmationStatus === 'CONFIRMED') {
      score = Math.max(0, score - 20);
      reasons.push('Müşteri randevuyu onaylamış.');
    }

    const bounded = Math.min(score, 100);
    return {
      score: bounded,
      level: this.level(bounded),
      reasons,
      suggestedAction:
        bounded >= 60
          ? 'Müşteriyle iletişimi teyit et; gerektiğinde reschedule/waitlist recovery akışını kullan.'
          : bounded >= 30
            ? 'Hatırlatma ve confirmation durumunu kontrol et.'
            : 'Ek operasyon aksiyonu gerekmiyor.',
    };
  }

  private delayRisk(row: UpcomingAppointment) {
    let score = 0;
    const reasons: string[] = [];

    if (row.activeResourceConflictCount > 0) {
      score += 60;
      reasons.push('Randevu için ayrılmış kaynak aktif bir kesintiyle çakışıyor.');
    }

    if (row.averageServiceOverrunMinutes >= 20 && row.historicalServiceCount >= 3) {
      score += 25;
      reasons.push(`Bu hizmet geçmişte ortalama ${Math.round(row.averageServiceOverrunMinutes)} dakika taşmış.`);
    } else if (row.averageServiceOverrunMinutes >= 10 && row.historicalServiceCount >= 3) {
      score += 15;
      reasons.push(`Bu hizmette geçmiş ortalama taşma ${Math.round(row.averageServiceOverrunMinutes)} dakika.`);
    }

    if (row.previousStaffAppointmentEndsAt) {
      const gapMinutes = Math.round(
        (row.startAt.getTime() - row.previousStaffAppointmentEndsAt.getTime()) / 60000,
      );
      if (gapMinutes < 0) {
        score += 50;
        reasons.push('Aynı personelin önceki randevusu planlanan başlangıçla çakışıyor.');
      } else if (gapMinutes < 10) {
        score += 20;
        reasons.push(`Personelin önceki randevusu ile yalnız ${gapMinutes} dakika tampon var.`);
      }
    }

    const bounded = Math.min(score, 100);
    return {
      score: bounded,
      level: this.level(bounded),
      reasons,
      suggestedAction:
        bounded >= 60
          ? 'Kaynak/personel planını şimdi kontrol et ve gerekirse alternatif slot veya kaynak ata.'
          : bounded >= 30
            ? 'Önceki hizmetin ilerleyişini ve kaynak hazırlığını yakından izle.'
            : 'Planlanan akış için belirgin gecikme sinyali yok.',
    };
  }

  private managerInsights(
    appointments: Array<UpcomingAppointment & { noShowRisk: { score: number; level: RiskLevel }; delayRisk: { score: number; level: RiskLevel } }>,
  ) {
    const highNoShow = appointments.filter((item) => item.noShowRisk.level === 'HIGH');
    const highDelay = appointments.filter((item) => item.delayRisk.level === 'HIGH');
    const unconfirmed = appointments.filter(
      (item) => !item.confirmationStatus || item.confirmationStatus === 'PENDING',
    );
    const resourceConflicts = appointments.filter(
      (item) => item.activeResourceConflictCount > 0,
    );

    const insights: Array<{
      code: string;
      severity: 'INFO' | 'WARNING' | 'HIGH';
      title: string;
      explanation: string;
      suggestedAction: string;
    }> = [];

    if (resourceConflicts.length) {
      insights.push({
        code: 'RESOURCE_CONFLICTS_UPCOMING',
        severity: 'HIGH',
        title: `${resourceConflicts.length} yaklaşan randevuda kaynak riski`,
        explanation: 'Aktif resource block ile ayrılmış kaynak çakışması tespit edildi.',
        suggestedAction: 'Incident/kaynak ekranından alternatif kaynak veya yeniden planlama aksiyonu al.',
      });
    }
    if (highDelay.length) {
      insights.push({
        code: 'DELAY_RISK_CLUSTER',
        severity: 'WARNING',
        title: `${highDelay.length} randevuda yüksek gecikme riski`,
        explanation: 'Kaynak kesintisi, tarihsel süre taşması veya sıkışık personel takvimi sinyali var.',
        suggestedAction: 'Canlı operasyon akışında personel ve kaynak tamponlarını kontrol et.',
      });
    }
    if (highNoShow.length) {
      insights.push({
        code: 'NO_SHOW_RISK_CLUSTER',
        severity: 'WARNING',
        title: `${highNoShow.length} randevuda yüksek no-show riski`,
        explanation: 'Geçmiş no-show/son dakika iptal ve confirmation sinyalleri birlikte değerlendirildi.',
        suggestedAction: 'CRM reminder/confirmation akışını kullan; otomatik ceza uygulama.',
      });
    }
    if (unconfirmed.length) {
      insights.push({
        code: 'UNCONFIRMED_APPOINTMENTS',
        severity: 'INFO',
        title: `${unconfirmed.length} yaklaşan randevu onay bekliyor`,
        explanation: 'Appointment fiziksel lifecycle’dan ayrı confirmation state henüz CONFIRMED değil.',
        suggestedAction: 'Hatırlatma & Onay ekranından müşterilerle iletişimi tamamla.',
      });
    }

    return insights;
  }

  private level(score: number): RiskLevel {
    if (score >= 60) return 'HIGH';
    if (score >= 30) return 'MEDIUM';
    return 'LOW';
  }
}
