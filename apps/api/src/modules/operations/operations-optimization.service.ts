import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';

import { TenantContext } from '../../common/tenant/tenant-context';
import { OperationsCapacityService } from './operations-capacity.service';
import { OperationsUtilizationService } from './operations-utilization.service';

type DemandRow = {
  serviceId: string;
  serviceName: string;
  isoDow: number;
  hourOfDay: number;
  historicalAppointments: number;
  upcomingAppointments: number;
};

type OutcomeTrendRow = {
  recentAppointments: number;
  recentNoShows: number;
  previousAppointments: number;
  previousNoShows: number;
};

@Injectable()
export class OperationsOptimizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
    private readonly capacity: OperationsCapacityService,
    private readonly utilization: OperationsUtilizationService,
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
    const { tenantId, branchId } = this.context();
    const safeHours = Math.min(Math.max(hours, 1), 168);
    const from = new Date();
    const to = new Date(from.getTime() + safeHours * 60 * 60 * 1000);

    const [capacity, utilization, demand, outcomeTrend] = await Promise.all([
      this.capacity.summary({ from, to }),
      this.utilization.summary({ from, to }),
      this.prisma.$queryRawUnsafe<DemandRow[]>(
        `WITH historical AS (
           SELECT a."serviceId" AS service_id,
                  EXTRACT(ISODOW FROM a."startAt")::int AS iso_dow,
                  EXTRACT(HOUR FROM a."startAt")::int AS hour_of_day,
                  COUNT(*)::int AS appointment_count
           FROM appointments a
           WHERE a."tenantId" = $1 AND a."branchId" = $2
             AND a.status::text NOT IN ('CANCELLED','NO_SHOW')
             AND a."startAt" >= CURRENT_TIMESTAMP - INTERVAL '56 days'
             AND a."startAt" < CURRENT_TIMESTAMP
           GROUP BY a."serviceId", iso_dow, hour_of_day
         ), upcoming AS (
           SELECT a."serviceId" AS service_id,
                  EXTRACT(ISODOW FROM a."startAt")::int AS iso_dow,
                  EXTRACT(HOUR FROM a."startAt")::int AS hour_of_day,
                  COUNT(*)::int AS appointment_count
           FROM appointments a
           WHERE a."tenantId" = $1 AND a."branchId" = $2
             AND a.status::text IN ('SCHEDULED','CONFIRMED')
             AND a."startAt" >= CURRENT_TIMESTAMP
             AND a."startAt" < CURRENT_TIMESTAMP + INTERVAL '7 days'
           GROUP BY a."serviceId", iso_dow, hour_of_day
         )
         SELECT h.service_id AS "serviceId", s.name AS "serviceName",
                h.iso_dow AS "isoDow", h.hour_of_day AS "hourOfDay",
                h.appointment_count AS "historicalAppointments",
                COALESCE(u.appointment_count, 0)::int AS "upcomingAppointments"
         FROM historical h
         JOIN services s ON s.id = h.service_id
         LEFT JOIN upcoming u ON u.service_id = h.service_id
           AND u.iso_dow = h.iso_dow AND u.hour_of_day = h.hour_of_day
         WHERE s."tenantId" = $1 AND s."branchId" = $2
         ORDER BY h.appointment_count DESC, s.name ASC
         LIMIT 50`,
        tenantId,
        branchId,
      ),
      this.prisma.$queryRawUnsafe<OutcomeTrendRow[]>(
        `SELECT
           COUNT(*) FILTER (WHERE a."startAt" >= CURRENT_TIMESTAMP - INTERVAL '7 days')::int AS "recentAppointments",
           COUNT(*) FILTER (WHERE a."startAt" >= CURRENT_TIMESTAMP - INTERVAL '7 days' AND a.status::text = 'NO_SHOW')::int AS "recentNoShows",
           COUNT(*) FILTER (WHERE a."startAt" >= CURRENT_TIMESTAMP - INTERVAL '35 days' AND a."startAt" < CURRENT_TIMESTAMP - INTERVAL '7 days')::int AS "previousAppointments",
           COUNT(*) FILTER (WHERE a."startAt" >= CURRENT_TIMESTAMP - INTERVAL '35 days' AND a."startAt" < CURRENT_TIMESTAMP - INTERVAL '7 days' AND a.status::text = 'NO_SHOW')::int AS "previousNoShows"
         FROM appointments a
         WHERE a."tenantId" = $1 AND a."branchId" = $2
           AND a."startAt" < CURRENT_TIMESTAMP`,
        tenantId,
        branchId,
      ),
    ]);

    const capacityRecommendations = capacity.bottlenecks.map((item) => ({
      code: `CAPACITY:${item.resourceType}:${item.category}`,
      priority: item.utilizationPercent >= 95 || item.remainingMinutes === 0 ? 'HIGH' : 'MEDIUM',
      title: `${item.category} kapasitesi baskı altında`,
      evidence: {
        resourceType: item.resourceType,
        utilizationPercent: item.utilizationPercent,
        remainingMinutes: item.remainingMinutes,
        blockedMinutes: item.blockedMinutes,
        unavailableResources: item.unavailableResources,
      },
      suggestedAction:
        item.unavailableResources > 0
          ? 'Bakım/kesinti kaynaklarını kontrol et; uygun olanları kapasiteye geri kazandır.'
          : 'Yeni talebi bu kategoriye yığmadan önce alternatif kaynak veya zaman penceresi değerlendir.',
    }));

    const mostLoaded = utilization.staff[0] ?? null;
    const leastLoaded = [...utilization.staff]
      .sort((left, right) => left.utilizationPercent - right.utilizationPercent)[0] ?? null;
    const staffRecommendations = [] as Array<{
      code: string;
      priority: 'INFO' | 'MEDIUM' | 'HIGH';
      title: string;
      explanation: string;
      suggestedAction: string;
    }>;
    if (
      mostLoaded &&
      leastLoaded &&
      mostLoaded.staffId !== leastLoaded.staffId &&
      mostLoaded.utilizationPercent >= 80 &&
      leastLoaded.utilizationPercent <= 50
    ) {
      staffRecommendations.push({
        code: 'STAFF_LOAD_IMBALANCE',
        priority: mostLoaded.utilizationPercent >= 95 ? 'HIGH' : 'MEDIUM',
        title: 'Personel yük dağılımı dengesiz',
        explanation: `${mostLoaded.staffName} %${mostLoaded.utilizationPercent} kullanımda; ${leastLoaded.staffName} %${leastLoaded.utilizationPercent} kullanımda.`,
        suggestedAction: 'Gelecek randevularda yalnız hizmet yetkinliği, izin, vardiya ve kaynak kuralları doğrulandıktan sonra daha düşük yüklü personele yönlendirmeyi değerlendir.',
      });
    }

    const demandAwareSlots = demand
      .map((row) => {
        const expectedPerWeek = Number((row.historicalAppointments / 8).toFixed(1));
        const demandGap = Number((expectedPerWeek - row.upcomingAppointments).toFixed(1));
        return {
          serviceId: row.serviceId,
          serviceName: row.serviceName,
          isoDow: row.isoDow,
          hourOfDay: row.hourOfDay,
          expectedPerWeek,
          upcomingAppointments: row.upcomingAppointments,
          demandGap,
          recommendation:
            demandGap >= 1
              ? 'Bu zaman penceresinde geçmiş talep gelecek haftadaki mevcut rezervasyondan yüksek. Waitlist/CRM talebi varsa bu pencereyi koru veya görünür kıl.'
              : 'Talep ile mevcut rezervasyon seviyesi dengeli görünüyor.',
        };
      })
      .filter((item) => item.expectedPerWeek >= 1.5 && item.demandGap >= 0.5)
      .sort((left, right) => right.demandGap - left.demandGap)
      .slice(0, 12);

    const trend = outcomeTrend[0] ?? {
      recentAppointments: 0,
      recentNoShows: 0,
      previousAppointments: 0,
      previousNoShows: 0,
    };
    const recentNoShowRate = trend.recentAppointments > 0
      ? (trend.recentNoShows / trend.recentAppointments) * 100
      : 0;
    const previousNoShowRate = trend.previousAppointments > 0
      ? (trend.previousNoShows / trend.previousAppointments) * 100
      : 0;

    const anomalies = [] as Array<{
      code: string;
      severity: 'INFO' | 'WARNING' | 'HIGH';
      title: string;
      explanation: string;
      suggestedAction: string;
    }>;
    if (
      trend.recentAppointments >= 5 &&
      recentNoShowRate >= 10 &&
      recentNoShowRate >= previousNoShowRate + 5
    ) {
      anomalies.push({
        code: 'NO_SHOW_RATE_SPIKE',
        severity: recentNoShowRate >= previousNoShowRate + 10 ? 'HIGH' : 'WARNING',
        title: 'No-show oranında olağandışı yükseliş',
        explanation: `Son 7 gün %${recentNoShowRate.toFixed(1)}, önceki 28 gün %${previousNoShowRate.toFixed(1)}.`,
        suggestedAction: 'Confirmation/reminder performansını ve no-show nedenlerini incele; otomatik cezalandırma uygulama.',
      });
    }
    if (capacity.bottlenecks.some((item) => item.utilizationPercent >= 95)) {
      anomalies.push({
        code: 'CAPACITY_SATURATION',
        severity: 'HIGH',
        title: 'Kritik kapasite doygunluğu',
        explanation: 'En az bir oda/cihaz kategorisinde seçilen pencerede kullanım %95 veya üzerinde.',
        suggestedAction: 'Kesinti, bakım ve alternatif kaynak seçeneklerini incele; yeni booking kararını deterministik conflict engine üzerinden doğrula.',
      });
    }

    return {
      horizonHours: safeHours,
      model: 'EXPLAINABLE_OPTIMIZATION_HEURISTIC_V1',
      automaticSchedulingEnabled: false,
      capacityRecommendations,
      staffRecommendations,
      demandAwareSlots,
      anomalies,
      evidence: {
        utilizationShiftAware: utilization.shiftAware,
        activeStaff: utilization.totals.activeStaff,
        staffUtilizationPercent: utilization.totals.utilizationPercent,
        capacityUtilizationPercent: capacity.totals.utilizationPercent,
      },
    };
  }
}
