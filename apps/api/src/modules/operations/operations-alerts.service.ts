import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';

import { TenantContext } from '../../common/tenant/tenant-context';
import type { OperationsAlertQuery } from './dto/operations-alert.dto';

type AlertSeverity = 'INFO' | 'WARNING' | 'HIGH' | 'CRITICAL';

type AlertRow = {
  id: string;
  type: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  sourceType: string;
  sourceId: string;
  startedAt: Date;
  ageMinutes: number;
  suggestedAction: string;
  customerId: string | null;
  customerName: string | null;
  staffId: string | null;
  staffName: string | null;
  resourceId: string | null;
  resourceName: string | null;
};

@Injectable()
export class OperationsAlertsService {
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

  async list(input: OperationsAlertQuery) {
    const { tenantId, companyId, branchId } = this.context();
    const rows = await this.prisma.$queryRawUnsafe<AlertRow[]>(
      `WITH waiting_visits AS (
         SELECT
           'waiting:' || v."id" AS id,
           'WAITING_TOO_LONG'::text AS type,
           CASE
             WHEN EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - COALESCE(v."checkedInAt", v."arrivedAt", v."updatedAt"))) / 60 >= ($4::int * 2)
               THEN 'HIGH' ELSE 'WARNING'
           END::text AS severity,
           'Müşteri bekleme süresi aşıldı'::text AS title,
           'Müşteri ' || floor(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - COALESCE(v."checkedInAt", v."arrivedAt", v."updatedAt"))) / 60)::int || ' dakikadır bekliyor.' AS message,
           'VISIT'::text AS "sourceType",
           v."id" AS "sourceId",
           COALESCE(v."checkedInAt", v."arrivedAt", v."updatedAt") AS "startedAt",
           floor(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - COALESCE(v."checkedInAt", v."arrivedAt", v."updatedAt"))) / 60)::int AS "ageMinutes",
           'Bekleme nedenini kontrol et ve servisi başlat veya müşteriyi bilgilendir.'::text AS "suggestedAction",
           v."customerId" AS "customerId",
           trim(concat(c."firstName", ' ', c."lastName")) AS "customerName",
           NULL::text AS "staffId",
           NULL::text AS "staffName",
           NULL::text AS "resourceId",
           NULL::text AS "resourceName"
         FROM visits v
         JOIN customers c ON c.id = v."customerId"
         WHERE v."tenantId" = $1 AND v."companyId" = $2 AND v."branchId" = $3
           AND v.status::text = 'WAITING'
           AND COALESCE(v."checkedInAt", v."arrivedAt", v."updatedAt") <= CURRENT_TIMESTAMP - ($4::int * INTERVAL '1 minute')
       ), checkout_stale AS (
         SELECT
           'checkout:' || v."id" AS id,
           'CHECKOUT_STALE'::text AS type,
           CASE
             WHEN EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - COALESCE(v."checkoutPendingAt", v."updatedAt"))) / 60 >= ($5::int * 2)
               THEN 'HIGH' ELSE 'WARNING'
           END::text AS severity,
           'Checkout işlemi bekliyor'::text AS title,
           'Müşteri checkout aşamasında ' || floor(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - COALESCE(v."checkoutPendingAt", v."updatedAt"))) / 60)::int || ' dakikadır bekliyor.' AS message,
           'VISIT'::text AS "sourceType",
           v."id" AS "sourceId",
           COALESCE(v."checkoutPendingAt", v."updatedAt") AS "startedAt",
           floor(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - COALESCE(v."checkoutPendingAt", v."updatedAt"))) / 60)::int AS "ageMinutes",
           'Ödeme, paket tüketimi ve checkout readiness blockerlarını kontrol et.'::text AS "suggestedAction",
           v."customerId" AS "customerId",
           trim(concat(c."firstName", ' ', c."lastName")) AS "customerName",
           NULL::text AS "staffId",
           NULL::text AS "staffName",
           NULL::text AS "resourceId",
           NULL::text AS "resourceName"
         FROM visits v
         JOIN customers c ON c.id = v."customerId"
         WHERE v."tenantId" = $1 AND v."companyId" = $2 AND v."branchId" = $3
           AND v.status::text = 'CHECKOUT_PENDING'
           AND COALESCE(v."checkoutPendingAt", v."updatedAt") <= CURRENT_TIMESTAMP - ($5::int * INTERVAL '1 minute')
       ), service_overruns AS (
         SELECT DISTINCT ON (v."id")
           'overrun:' || v."id" AS id,
           'SERVICE_OVERRUN'::text AS type,
           CASE
             WHEN EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - ap."endAt")) / 60 >= 30 THEN 'HIGH'
             ELSE 'WARNING'
           END::text AS severity,
           'Servis planlanan süreyi aştı'::text AS title,
           'Planlanan bitiş ' || floor(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - ap."endAt")) / 60)::int || ' dakika önceydi.' AS message,
           'VISIT'::text AS "sourceType",
           v."id" AS "sourceId",
           ap."endAt" AS "startedAt",
           floor(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - ap."endAt")) / 60)::int AS "ageMinutes",
           'Servisin gerçek durumunu ve sonraki randevu/resource etkisini kontrol et.'::text AS "suggestedAction",
           v."customerId" AS "customerId",
           trim(concat(c."firstName", ' ', c."lastName")) AS "customerName",
           ap."staffId" AS "staffId",
           trim(concat(st."firstName", ' ', st."lastName")) AS "staffName",
           NULL::text AS "resourceId",
           NULL::text AS "resourceName"
         FROM visits v
         JOIN visit_appointments va ON va."visitId" = v."id"
         JOIN appointments ap ON ap.id = va."appointmentId"
         JOIN customers c ON c.id = v."customerId"
         LEFT JOIN staff st ON st.id = ap."staffId"
         WHERE v."tenantId" = $1 AND v."companyId" = $2 AND v."branchId" = $3
           AND v.status::text = 'IN_SERVICE'
           AND ap."endAt" < CURRENT_TIMESTAMP
           AND ap.status::text NOT IN ('CANCELLED','NO_SHOW','COMPLETED')
         ORDER BY v."id", ap."endAt" ASC
       ), room_attention AS (
         SELECT
           'room:' || r.id AS id,
           'ROOM_ATTENTION'::text AS type,
           CASE WHEN r.status = 'OUT_OF_SERVICE' THEN 'HIGH' ELSE 'WARNING' END::text AS severity,
           CASE WHEN r.status = 'OUT_OF_SERVICE' THEN 'Oda kullanım dışı' ELSE 'Oda temizlik bekliyor' END::text AS title,
           r.name || ' durumu: ' || r.status AS message,
           'ROOM'::text AS "sourceType",
           r.id AS "sourceId",
           r.updated_at AS "startedAt",
           floor(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - r.updated_at)) / 60)::int AS "ageMinutes",
           CASE WHEN r.status = 'OUT_OF_SERVICE'
             THEN 'Kesinti nedenini ve etkilenen rezervasyonları kontrol et.'
             ELSE 'Temizlik tamamlandığında odayı tekrar AVAILABLE durumuna al.'
           END::text AS "suggestedAction",
           NULL::text AS "customerId",
           NULL::text AS "customerName",
           NULL::text AS "staffId",
           NULL::text AS "staffName",
           r.id AS "resourceId",
           r.name AS "resourceName"
         FROM operations_rooms r
         WHERE r.tenant_id = $1 AND r.company_id = $2 AND r.branch_id = $3
           AND r.status IN ('CLEANING','OUT_OF_SERVICE')
       ), open_incidents AS (
         SELECT
           'incident:' || i.id AS id,
           'ACTIVE_INCIDENT'::text AS type,
           CASE i.severity
             WHEN 'CRITICAL' THEN 'CRITICAL'
             WHEN 'HIGH' THEN 'HIGH'
             WHEN 'MEDIUM' THEN 'WARNING'
             ELSE 'INFO'
           END::text AS severity,
           i.title,
           COALESCE(i.description, 'Açık operasyon olayı') AS message,
           'INCIDENT'::text AS "sourceType",
           i.id AS "sourceId",
           i.opened_at AS "startedAt",
           floor(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - i.opened_at)) / 60)::int AS "ageMinutes",
           CASE
             WHEN i.resource_block_id IS NOT NULL THEN 'Kesintiyi ve etkilenen randevuları kontrol et; çözüm sonrası incidentı kapat.'
             ELSE 'Olayı değerlendir, gerekiyorsa Quality case ile ilişkilendir ve çözüm kaydı oluştur.'
           END::text AS "suggestedAction",
           NULL::text AS "customerId",
           NULL::text AS "customerName",
           NULL::text AS "staffId",
           NULL::text AS "staffName",
           COALESCE(i.room_id, i.inventory_asset_id) AS "resourceId",
           COALESCE(r.name, a.name) AS "resourceName"
         FROM operations_incidents i
         LEFT JOIN operations_rooms r ON r.id = i.room_id
         LEFT JOIN inventory_assets a ON a.id = i.inventory_asset_id
         WHERE i.tenant_id = $1 AND i.company_id = $2 AND i.branch_id = $3
           AND i.status = 'OPEN'
       ), alerts AS (
         SELECT * FROM waiting_visits
         UNION ALL SELECT * FROM checkout_stale
         UNION ALL SELECT * FROM service_overruns
         UNION ALL SELECT * FROM room_attention
         UNION ALL SELECT * FROM open_incidents
       )
       SELECT * FROM alerts
       ORDER BY CASE severity WHEN 'CRITICAL' THEN 4 WHEN 'HIGH' THEN 3 WHEN 'WARNING' THEN 2 ELSE 1 END DESC,
                "startedAt" ASC
       LIMIT $6`,
      tenantId,
      companyId,
      branchId,
      input.waitingMinutes,
      input.checkoutMinutes,
      input.limit,
    );

    const counts = rows.reduce<Record<AlertSeverity, number>>(
      (acc, row) => {
        acc[row.severity] += 1;
        return acc;
      },
      { INFO: 0, WARNING: 0, HIGH: 0, CRITICAL: 0 },
    );

    return {
      generatedAt: new Date(),
      thresholds: {
        waitingMinutes: input.waitingMinutes,
        checkoutMinutes: input.checkoutMinutes,
      },
      counts,
      alerts: rows,
    };
  }
}
