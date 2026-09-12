import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { randomUUID } from 'node:crypto';

export interface CreateMarketplaceBookingInput {
  companySlug: string;
  branchCode: string;
  serviceId: string;
  startAt: Date;
  idempotencyKey: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
}

type BookingScope = {
  tenantId: string;
  companyId: string;
  branchId: string;
  branchName: string;
  serviceId: string;
  serviceName: string;
  durationMinutes: number;
};

@Injectable()
export class MarketplaceBookingService {
  constructor(private readonly prisma: PrismaService) {}

  private async resolveScope(
    tx: Prisma.TransactionClient,
    companySlug: string,
    branchCode: string,
    serviceId: string,
  ): Promise<BookingScope> {
    const rows = await tx.$queryRawUnsafe<BookingScope[]>(
      `SELECT mp.tenant_id AS "tenantId",mp.company_id AS "companyId",mp.branch_id AS "branchId",
              b.name AS "branchName",s.id AS "serviceId",s.name AS "serviceName",
              s."durationMinutes" AS "durationMinutes"
       FROM marketplace_publications mp
       JOIN branches b ON b.id=mp.branch_id
       JOIN companies c ON c.id=mp.company_id
       JOIN services s ON s."branchId"=mp.branch_id AND s."tenantId"=mp.tenant_id
       WHERE mp.status='PUBLISHED'
         AND b.status='ACTIVE'
         AND c.status='ACTIVE'
         AND b."companyId"=mp.company_id
         AND c."tenantId"=mp.tenant_id
         AND c.slug=$1
         AND b.code=$2
         AND s.id=$3::text
         AND s.status='ACTIVE'
       LIMIT 1`,
      companySlug,
      branchCode,
      serviceId,
    );
    if (!rows.length) throw new NotFoundException('Published marketplace service not found.');
    return rows[0];
  }

  private response(row: any) {
    return {
      bookingReference: row.bookingReference,
      status: row.status,
      startAt: row.startAt,
      endAt: row.endAt,
      service: { name: row.serviceName },
      branch: { name: row.branchName },
    };
  }

  async create(input: CreateMarketplaceBookingInput) {
    const idempotencyKey = input.idempotencyKey.trim();
    if (!idempotencyKey || idempotencyKey.length > 160) {
      throw new BadRequestException('A valid idempotency key is required.');
    }
    if (!input.email?.trim() && !input.phone?.trim()) {
      throw new BadRequestException('Email or phone is required.');
    }
    if (input.startAt.getTime() <= Date.now()) {
      throw new BadRequestException('Marketplace booking start time must be in the future.');
    }

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const scope = await this.resolveScope(
            tx,
            input.companySlug,
            input.branchCode,
            input.serviceId,
          );

          await tx.$queryRawUnsafe(
            `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
            `marketplace-booking:${scope.branchId}:${idempotencyKey}`,
          );

          const existing = await tx.$queryRawUnsafe<any[]>(
            `SELECT mb.booking_reference AS "bookingReference",mb.status,mb.start_at AS "startAt",mb.end_at AS "endAt",
                    s.name AS "serviceName",b.name AS "branchName"
             FROM marketplace_bookings mb
             JOIN services s ON s.id=mb.service_id
             JOIN branches b ON b.id=mb.branch_id
             WHERE mb.tenant_id=$1::text AND mb.company_id=$2::text AND mb.branch_id=$3::text
               AND mb.idempotency_key=$4
             LIMIT 1`,
            scope.tenantId,
            scope.companyId,
            scope.branchId,
            idempotencyKey,
          );
          if (existing.length) return this.response(existing[0]);

          const startAt = input.startAt;
          const endAt = new Date(startAt.getTime() + Number(scope.durationMinutes) * 60_000);
          const staffRows = await tx.$queryRawUnsafe<Array<{ id: string }>>(
            `SELECT id FROM staff
             WHERE "tenantId"=$1::text AND "branchId"=$2::text AND status='ACTIVE'
             ORDER BY id`,
            scope.tenantId,
            scope.branchId,
          );
          if (!staffRows.length) {
            throw new ConflictException('No active staff is available for marketplace booking.');
          }

          let staffId: string | null = null;
          for (const staff of staffRows) {
            await tx.$queryRawUnsafe(
              `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
              `appointment-staff:${scope.tenantId}:${scope.branchId}:${staff.id}`,
            );
            const conflicts = await tx.$queryRawUnsafe<any[]>(
              `SELECT id FROM appointments
               WHERE "tenantId"=$1::text AND "branchId"=$2::text AND "staffId"=$3::text
                 AND status NOT IN ('CANCELLED','NO_SHOW')
                 AND "startAt" < $5 AND "endAt" > $4
               LIMIT 1`,
              scope.tenantId,
              scope.branchId,
              staff.id,
              startAt,
              endAt,
            );
            if (!conflicts.length) {
              staffId = staff.id;
              break;
            }
          }
          if (!staffId) {
            throw new ConflictException('Requested marketplace time is no longer available.');
          }

          const customerId = randomUUID();
          const appointmentId = randomUUID();
          const bookingId = randomUUID();
          const bookingReference = randomUUID();
          const firstName = input.firstName.trim();
          const lastName = input.lastName.trim();
          const email = input.email?.trim().toLowerCase() || null;
          const phone = input.phone?.trim() || null;

          await tx.$executeRawUnsafe(
            `INSERT INTO customers(
               id,"tenantId","branchId","firstName","lastName",phone,email,"customerSource","createdAt","updatedAt"
             ) VALUES($1::text,$2::text,$3::text,$4,$5,$6,$7,'OTHER'::"CustomerSource",NOW(),NOW())`,
            customerId,
            scope.tenantId,
            scope.branchId,
            firstName,
            lastName,
            phone,
            email,
          );

          await tx.$executeRawUnsafe(
            `INSERT INTO appointments(
               id,"tenantId","branchId","customerId","staffId","serviceId","startAt","endAt",status,notes,"createdAt","updatedAt"
             ) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6::text,$7,$8,'SCHEDULED',
               'Marketplace booking ' || $9,NOW(),NOW())`,
            appointmentId,
            scope.tenantId,
            scope.branchId,
            customerId,
            staffId,
            scope.serviceId,
            startAt,
            endAt,
            bookingReference,
          );

          const bookings = await tx.$queryRawUnsafe<any[]>(
            `INSERT INTO marketplace_bookings(
               id,booking_reference,tenant_id,company_id,branch_id,service_id,staff_id,customer_id,appointment_id,
               idempotency_key,requested_start_at,start_at,end_at,status,
               contact_first_name,contact_last_name,contact_email,contact_phone,contact_snapshot
             ) VALUES($1::text,$2,$3::text,$4::text,$5::text,$6::text,$7::text,$8::text,$9::text,$10,$11,$11,$12,
               'CONFIRMED',$13,$14,$15,$16,$17::jsonb)
             RETURNING booking_reference AS "bookingReference",status,start_at AS "startAt",end_at AS "endAt"`,
            bookingId,
            bookingReference,
            scope.tenantId,
            scope.companyId,
            scope.branchId,
            scope.serviceId,
            staffId,
            customerId,
            appointmentId,
            idempotencyKey,
            startAt,
            endAt,
            firstName,
            lastName,
            email,
            phone,
            JSON.stringify({ firstName, lastName, email, phone, source: 'MARKETPLACE_BOOKING' }),
          );

          await tx.$executeRawUnsafe(
            `INSERT INTO marketplace_booking_events(marketplace_booking_id,event_type,metadata)
             VALUES($1::text,'CONFIRMED',$2::jsonb)`,
            bookingId,
            JSON.stringify({ appointmentId, serviceId: scope.serviceId, startAt, endAt }),
          );

          return this.response({
            ...bookings[0],
            serviceName: scope.serviceName,
            branchName: scope.branchName,
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error: any) {
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException ||
        error instanceof ConflictException
      ) {
        throw error;
      }
      if (error?.code === '23P01') {
        throw new ConflictException('Requested marketplace time is no longer available.');
      }
      throw error;
    }
  }
}
