import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';

import { TenantContext } from '../../common/tenant/tenant-context';

export type CheckoutBlockerCode =
  | 'VISIT_NOT_CHECKOUT_PENDING'
  | 'PAYMENT_PENDING'
  | 'PACKAGE_SESSION_NOT_CONSUMED'
  | 'COMMERCIAL_CONTEXT_UNVERIFIED';

export type CheckoutWarningCode = 'COMMERCIAL_BALANCE_OUTSTANDING';

export interface VisitCheckoutIssue {
  code: CheckoutBlockerCode | CheckoutWarningCode;
  appointmentId?: string;
  message: string;
}

export interface VisitCheckoutReadiness {
  visitId: string;
  visitStatus: string;
  appointmentIds: string[];
  canCheckout: boolean;
  blockers: VisitCheckoutIssue[];
  warnings: VisitCheckoutIssue[];
}

@Injectable()
export class VisitCheckoutReadinessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  private context() {
    const tenantId = this.tenantContext.getTenantId();
    const branchId = this.tenantContext.getBranchId();

    if (!tenantId) {
      throw new InternalServerErrorException('İşletme çalışma kapsamı eksik.');
    }

    if (!branchId) {
      throw new BadRequestException(
        'Bu işlem için önce aktif bir şube seçmelisiniz.',
      );
    }

    return { tenantId, branchId };
  }

  async getReadiness(id: string): Promise<VisitCheckoutReadiness> {
    const { tenantId, branchId } = this.context();

    const visits = await this.prisma.$queryRawUnsafe<
      Array<{ id: string; companyId: string; customerId: string; status: string; source: 'APPOINTMENT' | 'WALK_IN' }>
    >(
      `SELECT "id", "companyId" AS "companyId", "customerId" AS "customerId",
              "status"::text AS "status", "source"::text AS "source"
       FROM "visits"
       WHERE "id" = $1
         AND "tenantId" = $2
         AND "branchId" = $3
       LIMIT 1`,
      id,
      tenantId,
      branchId,
    );

    const visit = visits[0];
    if (!visit) {
      throw new NotFoundException('Ziyaret kaydı bulunamadı.');
    }

    const links = await this.prisma.$queryRawUnsafe<
      Array<{ appointmentId: string }>
    >(
      `SELECT va."appointmentId"
       FROM "visit_appointments" va
       INNER JOIN "appointments" a ON a."id" = va."appointmentId"
       WHERE va."visitId" = $1
         AND a."tenantId" = $2
         AND a."branchId" = $3
       ORDER BY va."createdAt" ASC`,
      id,
      tenantId,
      branchId,
    );

    const appointmentIds = links.map((item) => item.appointmentId);
    const appointments = appointmentIds.length
      ? await this.prisma.appointment.findMany({
          where: {
            id: { in: appointmentIds },
            tenantId,
            branchId,
          },
          select: {
            id: true,
            payment: { select: { status: true } },
            session: { select: { status: true } },
          },
        })
      : [];

    const blockers: VisitCheckoutIssue[] = [];
    const warnings: VisitCheckoutIssue[] = [];

    const appointmentReceivables = appointmentIds.length
      ? await this.prisma.$queryRawUnsafe<
          Array<{
            appointmentId: string;
            grossAmount: string;
            collectedAmount: string;
          }>
        >(
          `SELECT i.source_id AS "appointmentId",
                  i.gross_amount::text AS "grossAmount",
                  COALESCE(
                    SUM(
                      CASE
                        WHEN r.id IS NULL THEN c.amount
                        ELSE 0
                      END
                    ),
                    0
                  )::text AS "collectedAmount"
           FROM income_records i
           LEFT JOIN income_collections c ON c.income_record_id=i.id
           LEFT JOIN income_collection_reversals r ON r.income_collection_id=c.id
           WHERE i.tenant_id=$1
             AND i.company_id=$2
             AND i.branch_id=$3
             AND i.source_type='APPOINTMENT'
             AND i.source_id = ANY($4::text[])
             AND i.approval_status::text <> 'CANCELLED'
           GROUP BY i.source_id,i.gross_amount`,
          tenantId,
          visit.companyId,
          branchId,
          appointmentIds,
        )
      : [];
    const receivableByAppointment = new Map(
      appointmentReceivables.map((item) => [item.appointmentId, item]),
    );

    if (visit.status !== 'CHECKOUT_PENDING') {
      blockers.push({
        code: 'VISIT_NOT_CHECKOUT_PENDING',
        message: 'Ziyaretin çıkış işlemi yapılmadan önce çıkış bekliyor aşamasına alınması gerekir.',
      });
    }

    for (const appointment of appointments) {
      if (appointment.session) {
        if (appointment.session.status !== 'CONSUMED') {
          blockers.push({
            code: 'PACKAGE_SESSION_NOT_CONSUMED',
            appointmentId: appointment.id,
            message: 'Bu randevuya bağlı paket seansı henüz kullanılmış olarak işaretlenmedi.',
          });
        }
        continue;
      }

      if (!appointment.payment || appointment.payment.status !== 'COMPLETED') {
        const receivable = receivableByAppointment.get(appointment.id);
        if (!receivable) {
          blockers.push({
            code: 'PAYMENT_PENDING',
            appointmentId: appointment.id,
            message:
              'Bu randevu için tamamlanmış ödeme veya Finans tarafında takip edilen bir alacak kaydı bulunmuyor.',
          });
          continue;
        }

        const gross = Number(receivable.grossAmount);
        const collected = Number(receivable.collectedAmount);
        if (collected + 0.01 < gross) {
          warnings.push({
            code: 'COMMERCIAL_BALANCE_OUTSTANDING',
            appointmentId: appointment.id,
            message:
              'Bu randevunun ödenmemiş bakiyesi Finans > Gelirler alanında alacak olarak takip ediliyor.',
          });
        }
      }
    }

    if (visit.source === 'WALK_IN' && appointmentIds.length === 0) {
      const contexts = await this.prisma.$queryRawUnsafe<
        Array<{ saleId: string; saleStatus: string; saleTotal: string; paidTotal: string; serviceItemCount: number }>
      >(
        `SELECT c.sale_id AS "saleId", s.status::text AS "saleStatus", s.total::text AS "saleTotal",
                COALESCE(SUM(CASE WHEN sp.status::text='COMPLETED' THEN sp.amount ELSE 0 END),0)::text AS "paidTotal",
                (SELECT COUNT(*)::int FROM sale_items si WHERE si."saleId"=s.id AND si.type::text='SERVICE' AND si."serviceId" IS NOT NULL) AS "serviceItemCount"
         FROM operations_walk_in_commercial_contexts c
         JOIN sales s ON s.id=c.sale_id
         LEFT JOIN sale_payments sp ON sp."saleId"=s.id AND sp."tenantId"=$2 AND sp."branchId"=$3
         WHERE c.visit_id=$1 AND c.tenant_id=$2 AND c.company_id=$4 AND c.branch_id=$3
           AND s."tenantId"=$2 AND s."branchId"=$3 AND s."customerId"=$5
         GROUP BY c.sale_id,s.status,s.total
         LIMIT 1`,
        id,
        tenantId,
        branchId,
        visit.companyId,
        visit.customerId,
      );
      const context = contexts[0];
      if (!context || context.saleStatus !== 'CONFIRMED' || Number(context.serviceItemCount) < 1) {
        blockers.push({
          code: 'COMMERCIAL_CONTEXT_UNVERIFIED',
          message: 'Randevusuz ziyaretin çıkışından önce aynı müşteri ve şubeye ait onaylanmış bir hizmet satışı bulunmalıdır.',
        });
      } else if (Number(context.paidTotal) < Number(context.saleTotal)) {
        warnings.push({
          code: 'COMMERCIAL_BALANCE_OUTSTANDING',
          message: 'Randevusuz müşterinin satışı doğrulandı ancak ödenmemiş bakiyesi bulunuyor.',
        });
      }
    }

    return {
      visitId: visit.id,
      visitStatus: visit.status,
      appointmentIds,
      canCheckout: blockers.length === 0,
      blockers,
      warnings,
    };
  }

  async assertCanCheckout(id: string) {
    const readiness = await this.getReadiness(id);
    if (!readiness.canCheckout) {
      throw new BadRequestException({
        message: 'Ziyaret çıkış işlemi için henüz hazır değil.',
        blockers: readiness.blockers,
      });
    }
    return readiness;
  }
}
