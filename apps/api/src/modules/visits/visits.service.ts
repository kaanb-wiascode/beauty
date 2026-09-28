import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  Injectable,
  Optional,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';

import { TenantContext } from '../../common/tenant/tenant-context';
import { DomainEventsService } from '../../infrastructure/domain-events/domain-events.service';
import { CheckInVisitInput } from './dto/check-in-visit.dto';
import { ListVisitsInput } from './dto/list-visits.dto';
import {
  CheckOutVisitInput,
  TransitionVisitInput,
} from './dto/transition-visit.dto';
import {
  canTransitionVisit,
  transitionTimestampColumn,
  VisitStatus,
} from './visit-lifecycle';

export interface VisitRow {
  id: string;
  tenantId: string;
  companyId: string;
  branchId: string;
  customerId: string;
  source: 'APPOINTMENT' | 'WALK_IN';
  status: VisitStatus;
  note: string | null;
  idempotencyKey: string | null;
  arrivedAt: Date | null;
  checkedInAt: Date | null;
  serviceStartedAt: Date | null;
  serviceCompletedAt: Date | null;
  checkoutPendingAt: Date | null;
  checkedOutAt: Date | null;
  cancelledAt: Date | null;
  version: number;
  createdByMembershipId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface VisitListRow extends VisitRow {
  appointmentIds: string[];
}

export interface VisitEventRow {
  id: string;
  visitId: string;
  actorMembershipId: string;
  eventType: string;
  fromStatus: VisitStatus | null;
  toStatus: VisitStatus | null;
  note: string | null;
  createdAt: Date;
}

@Injectable()
export class VisitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
    @Optional()
    private readonly domainEvents?: DomainEventsService,
  ) {}

  private context() {
    const tenantId = this.tenantContext.getTenantId();
    const companyId = this.tenantContext.getCompanyId();
    const branchId = this.tenantContext.getBranchId();
    const membershipId = this.tenantContext.getMembershipId();

    if (!tenantId || !companyId || !membershipId) {
      throw new InternalServerErrorException(
        'İşletme çalışma kapsamı eksik.',
      );
    }

    if (!branchId) {
      throw new BadRequestException(
        'Bu işlem için önce aktif bir şube seçmelisiniz.',
      );
    }

    return { tenantId, companyId, branchId, membershipId };
  }

  async checkIn(input: CheckInVisitInput) {
    const { tenantId, companyId, branchId, membershipId } = this.context();

    let eventId: string | null = null;
    const result = await this.prisma.$transaction(async (tx) => {
      if (input.idempotencyKey) {
        await tx.$queryRawUnsafe<Array<{ locked: number }>>(
          `SELECT 1::int AS locked
           FROM (
             SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))
           ) AS advisory_lock`,
          `${tenantId}:${branchId}`,
          `visit:${input.idempotencyKey}`,
        );

        const existing = await tx.$queryRawUnsafe<VisitRow[]>(
          `SELECT * FROM "visits"
           WHERE "tenantId" = $1
             AND "branchId" = $2
             AND "idempotencyKey" = $3
           LIMIT 1`,
          tenantId,
          branchId,
          input.idempotencyKey,
        );

        if (existing[0]) {
          return existing[0];
        }
      }

      let customerId: string;
      let appointmentId: string | null = null;
      let source: 'APPOINTMENT' | 'WALK_IN';

      if (input.appointmentId) {
        await tx.$queryRawUnsafe<Array<{ locked: number }>>(
          `SELECT 1::int AS locked
           FROM (
             SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))
           ) AS advisory_lock`,
          `${tenantId}:${branchId}`,
          `appointment:${input.appointmentId}`,
        );

        const existing = await tx.$queryRawUnsafe<VisitRow[]>(
          `SELECT v.*
           FROM "visits" v
           INNER JOIN "visit_appointments" va ON va."visitId" = v."id"
           WHERE va."appointmentId" = $1
             AND v."tenantId" = $2
             AND v."branchId" = $3
           LIMIT 1`,
          input.appointmentId,
          tenantId,
          branchId,
        );

        if (existing[0]) {
          return existing[0];
        }

        const appointment = await tx.appointment.findFirst({
          where: {
            id: input.appointmentId,
            tenantId,
            branchId,
          },
          select: {
            id: true,
            customerId: true,
            status: true,
          },
        });

        if (!appointment) {
          throw new NotFoundException('Randevu bulunamadı.');
        }

        if (!['SCHEDULED', 'CONFIRMED'].includes(appointment.status)) {
          throw new BadRequestException(
            'Yalnızca planlanmış veya onaylanmış randevular için müşteri girişi yapılabilir.',
          );
        }

        customerId = appointment.customerId;
        appointmentId = appointment.id;
        source = 'APPOINTMENT';
      } else {
        if (!input.customerId) {
          throw new BadRequestException(
            'Randevusuz müşteri girişi için müşteri seçilmelidir.',
          );
        }

        const customer = await tx.customer.findFirst({
          where: {
            id: input.customerId,
            tenantId,
            branchId,
          },
          select: { id: true },
        });

        if (!customer) {
          throw new NotFoundException('Müşteri bulunamadı.');
        }

        customerId = customer.id;
        source = 'WALK_IN';
      }

      const visitId = randomUUID();
      const now = new Date();

      await tx.$executeRawUnsafe(
        `INSERT INTO "visits" (
          "id", "tenantId", "companyId", "branchId", "customerId",
          "source", "status", "note", "idempotencyKey", "version",
          "createdByMembershipId", "createdAt", "updatedAt"
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6::"VisitSource", 'EXPECTED'::"VisitStatus", $7, $8, 1,
          $9, $10, $10
        )`,
        visitId,
        tenantId,
        companyId,
        branchId,
        customerId,
        source,
        input.note ?? null,
        input.idempotencyKey ?? null,
        membershipId,
        now,
      );

      if (appointmentId) {
        await tx.$executeRawUnsafe(
          `INSERT INTO "visit_appointments" ("visitId", "appointmentId")
           VALUES ($1, $2)`,
          visitId,
          appointmentId,
        );
      }

      await tx.$executeRawUnsafe(
        `INSERT INTO "visit_events" (
          "id", "visitId", "tenantId", "branchId", "actorMembershipId",
          "eventType", "fromStatus", "toStatus", "note", "createdAt"
        ) VALUES (
          $1, $2, $3, $4, $5,
          'VISIT_CREATED', NULL, 'EXPECTED'::"VisitStatus", $6, $7
        )`,
        randomUUID(),
        visitId,
        tenantId,
        branchId,
        membershipId,
        input.note ?? null,
        now,
      );

      const checkedIn = await tx.$queryRawUnsafe<VisitRow[]>(
        `UPDATE "visits"
         SET "status" = 'CHECKED_IN'::"VisitStatus",
             "arrivedAt" = $2,
             "checkedInAt" = $2,
             "version" = 2,
             "updatedAt" = $2
         WHERE "id" = $1 AND "version" = 1
         RETURNING *`,
        visitId,
        now,
      );

      if (checkedIn.length !== 1) {
        throw new ConflictException('Müşteri girişi sırasında kayıt değişti. Lütfen tekrar deneyin.');
      }

      await tx.$executeRawUnsafe(
        `INSERT INTO "visit_events" (
          "id", "visitId", "tenantId", "branchId", "actorMembershipId",
          "eventType", "fromStatus", "toStatus", "note", "createdAt"
        ) VALUES (
          $1, $2, $3, $4, $5,
          'CHECKED_IN', 'EXPECTED'::"VisitStatus",
          'CHECKED_IN'::"VisitStatus", $6, $7
        )`,
        randomUUID(),
        visitId,
        tenantId,
        branchId,
        membershipId,
        input.note ?? null,
        now,
      );

      eventId =
        (await this.domainEvents?.record(tx, {
          eventName: 'visit.checked_in',
          aggregateType: 'visit',
          aggregateId: checkedIn[0].id,
          payload: {
            customerId: checkedIn[0].customerId,
            source: checkedIn[0].source,
            status: checkedIn[0].status,
          },
        })) ?? null;

      return checkedIn[0];
    });
    if (eventId) await this.domainEvents?.dispatchStored(eventId);
    return result;
  }

  async findAll(input: ListVisitsInput) {
    const { tenantId, branchId } = this.context();
    const params: unknown[] = [tenantId, branchId];
    const conditions = [`v."tenantId" = $1`, `v."branchId" = $2`];

    if (input.status) {
      params.push(input.status);
      conditions.push(`v."status" = $${params.length}::"VisitStatus"`);
    }

    if (input.customerId) {
      params.push(input.customerId);
      conditions.push(`v."customerId" = $${params.length}`);
    }

    params.push(input.limit);

    return this.prisma.$queryRawUnsafe<VisitListRow[]>(
      `SELECT v.*,
              trim(concat(c."firstName", ' ', c."lastName")) AS "customerName",
              COALESCE(
                ARRAY(
                  SELECT va."appointmentId"
                  FROM "visit_appointments" va
                  WHERE va."visitId" = v."id"
                  ORDER BY va."createdAt" ASC
                ),
                ARRAY[]::TEXT[]
              ) AS "appointmentIds"
       FROM "visits" v
       JOIN "customers" c
         ON c."id" = v."customerId"
        AND c."tenantId" = v."tenantId"
        AND c."branchId" = v."branchId"
       WHERE ${conditions.join(' AND ')}
       ORDER BY v."createdAt" DESC
       LIMIT $${params.length}`,
      ...params,
    );
  }

  async findOne(id: string) {
    const { tenantId, branchId } = this.context();
    const visits = await this.prisma.$queryRawUnsafe<VisitRow[]>(
      `SELECT * FROM "visits"
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

    const [appointments, timeline] = await Promise.all([
      this.prisma.$queryRawUnsafe<Array<{ appointmentId: string }>>(
        `SELECT "appointmentId"
         FROM "visit_appointments"
         WHERE "visitId" = $1
         ORDER BY "createdAt" ASC`,
        id,
      ),
      this.prisma.$queryRawUnsafe<VisitEventRow[]>(
        `SELECT "id", "visitId", "actorMembershipId", "eventType",
                "fromStatus", "toStatus", "note", "createdAt"
         FROM "visit_events"
         WHERE "visitId" = $1
           AND "tenantId" = $2
           AND "branchId" = $3
         ORDER BY "createdAt" ASC, "id" ASC`,
        id,
        tenantId,
        branchId,
      ),
    ]);

    return {
      ...visit,
      appointmentIds: appointments.map((item) => item.appointmentId),
      timeline,
    };
  }

  async transition(
    id: string,
    input: TransitionVisitInput,
    eventType = 'STATUS_CHANGED',
  ) {
    const { tenantId, branchId, membershipId } = this.context();

    let eventId: string | null = null;
    const result = await this.prisma.$transaction(async (tx) => {
      const currentRows = await tx.$queryRawUnsafe<VisitRow[]>(
        `SELECT * FROM "visits"
         WHERE "id" = $1
           AND "tenantId" = $2
           AND "branchId" = $3
         LIMIT 1`,
        id,
        tenantId,
        branchId,
      );

      const current = currentRows[0];
      if (!current) {
        throw new NotFoundException('Ziyaret kaydı bulunamadı.');
      }

      if (current.version !== input.expectedVersion) {
        throw new ConflictException(
          'Ziyaret kaydı başka bir işlem tarafından değiştirildi. Lütfen ekranı yenileyin.',
        );
      }

      if (!canTransitionVisit(current.status, input.toStatus)) {
        throw new BadRequestException(
          'Ziyaret mevcut durumundan istenen aşamaya geçirilemez.',
        );
      }

      if (current.status === 'IN_SERVICE' && input.toStatus === 'SERVICE_COMPLETED') {
        const executionState = await tx.$queryRawUnsafe<
          Array<{ total: number; inProgress: number; completed: number }>
        >(
          `SELECT COUNT(*)::int AS total,
                  COUNT(*) FILTER (WHERE status::text='IN_PROGRESS')::int AS "inProgress",
                  COUNT(*) FILTER (WHERE status::text='COMPLETED')::int AS completed
             FROM operations_service_executions
            WHERE visit_id=$1 AND tenant_id=$2 AND branch_id=$3
              AND status::text <> 'CANCELLED'`,
          current.id,
          tenantId,
          branchId,
        );
        const state = executionState[0] ?? { total: 0, inProgress: 0, completed: 0 };
        if (state.total === 0) {
          throw new BadRequestException(
            'Ziyaret hizmet tamamlandı aşamasına alınmadan önce en az bir hizmet uygulama kaydı başlatılmalıdır.',
          );
        }
        if (state.inProgress > 0) {
          throw new BadRequestException(
            'Devam eden hizmet uygulamaları tamamlanmadan ziyaret hizmet tamamlandı aşamasına alınamaz.',
          );
        }

        const linkedAppointments = await tx.$queryRawUnsafe<
          Array<{ total: number; incomplete: number }>
        >(
          `SELECT COUNT(*)::int AS total,
                  COUNT(*) FILTER (WHERE a.status::text <> 'COMPLETED')::int AS incomplete
             FROM visit_appointments va
             JOIN appointments a ON a.id=va."appointmentId"
            WHERE va."visitId"=$1 AND a."tenantId"=$2 AND a."branchId"=$3`,
          current.id,
          tenantId,
          branchId,
        );
        if ((linkedAppointments[0]?.total ?? 0) > 0 && (linkedAppointments[0]?.incomplete ?? 0) > 0) {
          throw new BadRequestException(
            'Bağlı randevular tamamlanmadan ziyaret hizmet tamamlandı aşamasına alınamaz. Hizmet Uygulama Kayıtları ekranından randevu tamamlamasını gerçekleştirin.',
          );
        }
      }

      const timestampColumn = transitionTimestampColumn(input.toStatus);
      const timestampSet = timestampColumn
        ? `, "${timestampColumn}" = $6`
        : '';
      const now = new Date();

      const updated = await tx.$queryRawUnsafe<VisitRow[]>(
        `UPDATE "visits"
         SET "status" = $4::"VisitStatus",
             "version" = "version" + 1,
             "updatedAt" = $6
             ${timestampSet}
         WHERE "id" = $1
           AND "tenantId" = $2
           AND "branchId" = $3
           AND "version" = $5
         RETURNING *`,
        id,
        tenantId,
        branchId,
        input.toStatus,
        input.expectedVersion,
        now,
      );

      if (updated.length !== 1) {
        throw new ConflictException(
          'Ziyaret durumu işlem sırasında değişti. Lütfen ekranı yenileyip tekrar deneyin.',
        );
      }

      await tx.$executeRawUnsafe(
        `INSERT INTO "visit_events" (
          "id", "visitId", "tenantId", "branchId", "actorMembershipId",
          "eventType", "fromStatus", "toStatus", "note", "createdAt"
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7::"VisitStatus", $8::"VisitStatus", $9, $10
        )`,
        randomUUID(),
        id,
        tenantId,
        branchId,
        membershipId,
        eventType,
        current.status,
        input.toStatus,
        input.note ?? null,
        now,
      );

      eventId =
        (await this.domainEvents?.record(tx, {
          eventName:
            input.toStatus === 'CHECKED_OUT'
              ? 'visit.checked_out'
              : 'visit.status_changed',
          aggregateType: 'visit',
          aggregateId: updated[0].id,
          payload: {
            status: updated[0].status,
            eventType,
          },
        })) ?? null;

      return updated[0];
    });
    if (eventId) await this.domainEvents?.dispatchStored(eventId);
    return result;
  }

  async checkOut(id: string, input: CheckOutVisitInput) {
    return this.transition(
      id,
      {
        ...input,
        toStatus: 'CHECKED_OUT',
      },
      'CHECKED_OUT',
    );
  }
}