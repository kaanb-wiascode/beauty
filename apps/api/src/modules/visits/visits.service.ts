import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';

import { TenantContext } from '../../common/tenant/tenant-context';
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

interface VisitRow {
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

interface VisitListRow extends VisitRow {
  appointmentIds: string[];
}

interface VisitEventRow {
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
  ) {}

  private context() {
    const tenantId = this.tenantContext.getTenantId();
    const companyId = this.tenantContext.getCompanyId();
    const branchId = this.tenantContext.getBranchId();
    const membershipId = this.tenantContext.getMembershipId();

    if (!tenantId || !companyId || !membershipId) {
      throw new InternalServerErrorException(
        'Organization context is incomplete.',
      );
    }

    if (!branchId) {
      throw new BadRequestException(
        'A branch must be selected for this operation.',
      );
    }

    return { tenantId, companyId, branchId, membershipId };
  }

  async checkIn(input: CheckInVisitInput) {
    const { tenantId, companyId, branchId, membershipId } = this.context();

    return this.prisma.$transaction(async (tx) => {
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
          throw new NotFoundException('Appointment not found');
        }

        if (!['SCHEDULED', 'CONFIRMED'].includes(appointment.status)) {
          throw new BadRequestException(
            'Only scheduled or confirmed appointments can be checked in.',
          );
        }

        customerId = appointment.customerId;
        appointmentId = appointment.id;
        source = 'APPOINTMENT';
      } else {
        if (!input.customerId) {
          throw new BadRequestException(
            'customerId is required for walk-in check-in.',
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
          throw new NotFoundException('Customer not found');
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
        throw new ConflictException('Visit check-in conflicted.');
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

      return checkedIn[0];
    });
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
      throw new NotFoundException('Visit not found');
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

    return this.prisma.$transaction(async (tx) => {
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
        throw new NotFoundException('Visit not found');
      }

      if (current.version !== input.expectedVersion) {
        throw new ConflictException(
          'Visit changed since it was last read. Refresh and retry.',
        );
      }

      if (!canTransitionVisit(current.status, input.toStatus)) {
        throw new BadRequestException(
          `Invalid visit transition: ${current.status} -> ${input.toStatus}`,
        );
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
          'Visit changed during this transition. Refresh and retry.',
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

      return updated[0];
    });
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