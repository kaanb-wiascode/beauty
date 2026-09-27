import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';

import { Prisma, PrismaService } from '@beauty-erp/database';

import { TenantContext } from '../../common/tenant/tenant-context';
import { DomainEventsService } from '../../infrastructure/domain-events/domain-events.service';
import { AccountingService } from '../accounting/accounting.service';
import { CommerceFinanceSyncService } from '../finance/commerce-finance-sync.service';
import { OrganizationScopeService } from '../../common/tenant/organization-scope.service';
import { CreateAppointmentInput } from './dto/create-appointment.dto';
import { ListAppointmentsInput } from './dto/list-appointments.dto';
import { UpdateAppointmentInput } from './dto/update-appointment.dto';

type ReferenceClient = Pick<
  Prisma.TransactionClient,
  'customer' | 'staff' | 'service'
>;

type AppointmentClient = Pick<Prisma.TransactionClient, 'appointment'>;
type RawCrmClient = Pick<
  Prisma.TransactionClient,
  '$queryRawUnsafe' | '$executeRawUnsafe'
>;

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
    private readonly organizationScope: OrganizationScopeService,
    private readonly accountingService: AccountingService,
    private readonly commerceFinanceSync: CommerceFinanceSyncService,
    private readonly domainEvents?: DomainEventsService,
  ) {}

  private getTenantId(): string {
    const tenantId = this.tenantContext.getTenantId();

    if (!tenantId) {
      throw new InternalServerErrorException('İşletme çalışma kapsamı bulunamadı.');
    }

    return tenantId;
  }

  private requireBranchId(): string {
    const branchId = this.tenantContext.getBranchId();

    if (!branchId) {
      throw new BadRequestException(
        'Bu işlem için önce aktif bir şube seçmelisiniz.',
      );
    }

    return branchId;
  }

  private async currentUserId(db: RawCrmClient): Promise<string> {
    const context = this.tenantContext.getContext();
    const rows = await db.$queryRawUnsafe<Array<{ userId: string }>>(
      `SELECT "userId" AS "userId"
         FROM memberships
        WHERE id=$1::text AND "tenantId"=$2::text AND "companyId"=$3::text
        LIMIT 1`,
      context.membershipId,
      context.tenantId,
      context.companyId,
    );
    if (!rows[0]?.userId) {
      throw new InternalServerErrorException(
        'Oturum açmış kullanıcı bilgisi bulunamadı.',
      );
    }
    return rows[0].userId;
  }

  private async recordCrmAppointmentEvent(
    db: RawCrmClient,
    input: {
      customerId: string;
      appointmentId: string;
      branchId: string;
      eventType: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<void> {
    const context = this.tenantContext.getContext();
    const actorUserId = await this.currentUserId(db);
    await db.$executeRawUnsafe(
      `INSERT INTO crm_events(
         tenant_id,company_id,branch_id,customer_id,appointment_id,event_type,actor_user_id,metadata
       ) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6,$7::text,$8::jsonb)`,
      context.tenantId,
      context.companyId,
      input.branchId,
      input.customerId,
      input.appointmentId,
      input.eventType,
      actorUserId,
      JSON.stringify(input.metadata ?? {}),
    );
  }

  private validateDateRange(startAt: Date, endAt: Date): void {
    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
      throw new BadRequestException('Randevu tarihi geçersiz.');
    }

    if (startAt >= endAt) {
      throw new BadRequestException('Randevu başlangıç zamanı bitiş zamanından önce olmalıdır.');
    }
  }

  private async validateReferences(
    db: ReferenceClient,
    tenantId: string,
    input: {
      customerId: string;
      staffId: string;
      serviceId: string;
    },
    branchId: string,
  ): Promise<void> {
    const [customer, staff, service] = await Promise.all([
      db.customer.findFirst({
        where: {
          id: input.customerId,
          tenantId,
          branchId,
        },
        select: { id: true },
      }),
      db.staff.findFirst({
        where: {
          id: input.staffId,
          tenantId,
          branchId,
        },
        select: {
          id: true,
          status: true,
        },
      }),
      db.service.findFirst({
        where: {
          id: input.serviceId,
          tenantId,
          branchId,
        },
        select: {
          id: true,
          status: true,
        },
      }),
    ]);

    if (!customer) {
      throw new NotFoundException('Müşteri bulunamadı.');
    }

    if (!staff) {
      throw new NotFoundException('Personel bulunamadı.');
    }

    if (!service) {
      throw new NotFoundException('Hizmet bulunamadı.');
    }

    if (staff.status !== 'ACTIVE') {
      throw new BadRequestException('Seçilen personel aktif değil.');
    }

    if (service.status !== 'ACTIVE') {
      throw new BadRequestException('Seçilen hizmet aktif değil.');
    }
  }

  private async ensureNoStaffOverlap(
    db: AppointmentClient,
    tenantId: string,
    branchId: string,
    staffId: string,
    startAt: Date,
    endAt: Date,
    excludeId?: string,
  ): Promise<void> {
    const conflict = await db.appointment.findFirst({
      where: {
        tenantId,
        branchId,
        staffId,
        ...(excludeId
          ? {
              id: {
                not: excludeId,
              },
            }
          : {}),
        status: {
          notIn: ['CANCELLED', 'NO_SHOW'],
        },
        startAt: { lt: endAt },
        endAt: { gt: startAt },
      },
      select: {
        id: true,
        startAt: true,
        endAt: true,
      },
    });

    if (conflict) {
      throw new ConflictException(
        'Seçilen personelin bu saat aralığında başka bir randevusu bulunuyor.',
      );
    }
  }

  async findEligibleSessions(customerId: string, serviceId: string) {
    const tenantId = this.getTenantId();
    const branchId = this.requireBranchId();

    return this.prisma.session.findMany({
      where: {
        tenantId,
        branchId,
        serviceId,
        status: 'AVAILABLE',
        appointmentId: null,
        customerPackage: {
          customerId,
          status: 'ACTIVE',
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
      },
      include: {
        customerPackage: {
          include: {
            package: true,
          },
        },
        service: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });
  }

  async create(input: CreateAppointmentInput) {
    const tenantId = this.getTenantId();
    const branchId = this.requireBranchId();

    this.validateDateRange(input.startAt, input.endAt);

    await this.validateReferences(
      this.prisma,
      tenantId,
      {
        customerId: input.customerId,
        staffId: input.staffId,
        serviceId: input.serviceId,
      },
      branchId,
    );

    try {
      let eventId: string | null = null;
      const result = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRawUnsafe<Array<{ locked: number }>>(
          `SELECT 1::int AS locked
           FROM (
             SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))
           ) AS advisory_lock`,
          `${tenantId}:${branchId}`,
          input.staffId,
        );

        await this.ensureNoStaffOverlap(
          tx,
          tenantId,
          branchId,
          input.staffId,
          input.startAt,
          input.endAt,
        );

        if (input.sessionId) {
          const session = await tx.session.findFirst({
            where: {
              id: input.sessionId,
              tenantId,
              branchId,
              serviceId: input.serviceId,
              status: 'AVAILABLE',
              appointmentId: null,
              customerPackage: {
                customerId: input.customerId,
                status: 'ACTIVE',
                OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
              },
            },
            select: { id: true },
          });

          if (!session) {
            throw new BadRequestException(
              'Seçilen paket seansı bu müşteri, hizmet veya şube için kullanılamıyor.',
            );
          }
        }

        const appointment = await tx.appointment.create({
          data: {
            tenantId,
            branchId,
            customerId: input.customerId,
            staffId: input.staffId,
            serviceId: input.serviceId,
            startAt: input.startAt,
            endAt: input.endAt,
            notes: input.notes?.trim() || null,
          },
        });

        if (input.sessionId) {
          const reserved = await tx.session.updateMany({
            where: {
              id: input.sessionId,
              tenantId,
              branchId,
              status: 'AVAILABLE',
              appointmentId: null,
            },
            data: {
              status: 'RESERVED',
              appointmentId: appointment.id,
            },
          });

          if (reserved.count !== 1) {
            throw new ConflictException(
              'Seçilen paket seansı başka bir işlem tarafından ayrıldı. Lütfen başka bir seans seçin.',
            );
          }
        }

        const createdAppointment = await tx.appointment.findUnique({
          where: { id: appointment.id },
          include: {
            session: {
              include: {
                customerPackage: {
                  include: { package: true },
                },
              },
            },
          },
        });

        await this.recordCrmAppointmentEvent(tx, {
          customerId: appointment.customerId,
          appointmentId: appointment.id,
          branchId: appointment.branchId,
          eventType: 'APPOINTMENT_CREATED',
          metadata: {
            startAt: appointment.startAt.toISOString(),
            endAt: appointment.endAt.toISOString(),
            staffId: appointment.staffId,
            serviceId: appointment.serviceId,
          },
        });

        if (createdAppointment) {
          eventId =
            (await this.domainEvents?.record(tx, {
              eventName: 'appointment.created',
              aggregateType: 'appointment',
              aggregateId: createdAppointment.id,
              payload: {
                customerId: createdAppointment.customerId,
                serviceId: createdAppointment.serviceId,
                staffId: createdAppointment.staffId,
                startAt: createdAppointment.startAt.toISOString(),
                sessionId: createdAppointment.session?.id ?? null,
              },
            })) ?? null;
        }

        return createdAppointment;
      });
      if (eventId) await this.domainEvents?.dispatchStored(eventId);
      return result;
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof ConflictException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }

      console.error('[AppointmentsService.create] Prisma error:', error);

      throw new InternalServerErrorException('Randevu oluşturulamadı.');
    }
  }

  async findAll(input: ListAppointmentsInput) {
    const { page, limit, status, staffId, customerId, serviceId, from, to } =
      input;

    if (from && to && from > to) {
      throw new BadRequestException('Başlangıç tarihi bitiş tarihinden önce olmalıdır.');
    }

    const skip = (page - 1) * limit;
    const organizationScope =
      await this.organizationScope.getBranchScopedWhere();

    const where = {
      ...organizationScope,
      ...(status ? { status } : {}),
      ...(staffId ? { staffId } : {}),
      ...(customerId ? { customerId } : {}),
      ...(serviceId ? { serviceId } : {}),
      ...(from || to
        ? {
            AND: [
              ...(from ? [{ endAt: { gt: from } }] : []),
              ...(to ? [{ startAt: { lt: to } }] : []),
            ],
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.appointment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { startAt: 'asc' },
        include: {
          payment: {
            select: {
              id: true,
              amount: true,
              method: true,
              paidAt: true,
            },
          },
          session: {
            include: {
              customerPackage: {
                include: { package: true },
              },
            },
          },
        },
      }),
      this.prisma.appointment.count({ where }),
    ]);

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const organizationScope =
      await this.organizationScope.getBranchScopedWhere();
    const appointment = await this.prisma.appointment.findFirst({
      where: {
        id,
        ...organizationScope,
      },
      include: {
        payment: {
          select: {
            id: true,
            amount: true,
            method: true,
            paidAt: true,
          },
        },
        session: {
          include: {
            service: true,
            customerPackage: {
              include: {
                package: true,
              },
            },
          },
        },
      },
    });

    if (!appointment) {
      throw new NotFoundException('Randevu bulunamadı.');
    }

    return appointment;
  }

  async update(id: string, input: UpdateAppointmentInput) {
    const tenantId = this.getTenantId();
    const organizationScope =
      await this.organizationScope.getBranchScopedWhere();

    try {
      let eventId: string | null = null;
      const result = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRawUnsafe<Array<{ locked: number }>>(
          `SELECT 1::int AS locked
           FROM (
             SELECT pg_advisory_xact_lock(hashtext($1))
           ) AS advisory_lock`,
          `appointment:${id}`,
        );

        const appointment = await tx.appointment.findFirst({
          where: {
            id,
            ...organizationScope,
          },
          include: {
            session: true,
          },
        });

        if (!appointment) {
          throw new NotFoundException('Randevu bulunamadı.');
        }

        if (
          appointment.status === 'CANCELLED' &&
          input.status !== 'CANCELLED'
        ) {
          throw new BadRequestException(
            'İptal edilmiş randevu yeniden etkinleştirilemez.',
          );
        }

        if (
          ['COMPLETED', 'NO_SHOW'].includes(appointment.status) &&
          input.status &&
          input.status !== appointment.status
        ) {
          throw new ConflictException(
            'Tamamlanmış veya gelmedi olarak işaretlenmiş randevunun durumu değiştirilemez.',
          );
        }

        const customerId = input.customerId ?? appointment.customerId;
        const staffId = input.staffId ?? appointment.staffId;
        const serviceId = input.serviceId ?? appointment.serviceId;
        const startAt = input.startAt ?? appointment.startAt;
        const endAt = input.endAt ?? appointment.endAt;

        this.validateDateRange(startAt, endAt);

        await this.validateReferences(
          tx,
          tenantId,
          { customerId, staffId, serviceId },
          appointment.branchId,
        );

        if (
          appointment.session &&
          (customerId !== appointment.customerId ||
            serviceId !== appointment.serviceId)
        ) {
          const matchingSession = await tx.session.findFirst({
            where: {
              id: appointment.session.id,
              tenantId,
              branchId: appointment.branchId,
              serviceId,
              customerPackage: { customerId },
            },
            select: { id: true },
          });

          if (!matchingSession) {
            throw new BadRequestException(
              'Ayrılmış paket seansı yeni müşteri veya hizmetle eşleşmediği için bu bilgiler değiştirilemez.',
            );
          }
        }

        await tx.$queryRawUnsafe<Array<{ locked: number }>>(
          `SELECT 1::int AS locked
           FROM (
             SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))
           ) AS advisory_lock`,
          `${tenantId}:${appointment.branchId}`,
          staffId,
        );

        await this.ensureNoStaffOverlap(
          tx,
          tenantId,
          appointment.branchId,
          staffId,
          startAt,
          endAt,
          id,
        );

        const updated = await tx.appointment.update({
          where: { id },
          data: {
            ...(input.customerId !== undefined && {
              customerId: input.customerId,
            }),
            ...(input.staffId !== undefined && {
              staffId: input.staffId,
            }),
            ...(input.serviceId !== undefined && {
              serviceId: input.serviceId,
            }),
            ...(input.startAt !== undefined && {
              startAt: input.startAt,
            }),
            ...(input.endAt !== undefined && {
              endAt: input.endAt,
            }),
            ...(input.notes !== undefined && {
              notes: input.notes.trim() || null,
            }),
            ...(input.status !== undefined && {
              status: input.status,
            }),
          },
        });

        if (appointment.session && input.status) {
          if (input.status === 'CANCELLED' || input.status === 'NO_SHOW') {
            const released = await tx.session.updateMany({
              where: {
                id: appointment.session.id,
                tenantId,
                branchId: appointment.branchId,
                status: 'RESERVED',
                appointmentId: appointment.id,
              },
              data: {
                status: 'AVAILABLE',
                appointmentId: null,
              },
            });

            if (
              appointment.session.status === 'RESERVED' &&
              released.count !== 1
            ) {
              throw new ConflictException(
                'Ayrılmış paket seansı işlem sırasında değişti. Lütfen ekranı yenileyin.',
              );
            }
          }

          if (input.status === 'COMPLETED') {
            const consumed = await tx.session.updateMany({
              where: {
                id: appointment.session.id,
                tenantId,
                branchId: appointment.branchId,
                status: 'RESERVED',
                appointmentId: appointment.id,
              },
              data: {
                status: 'CONSUMED',
                consumedAt: new Date(),
              },
            });

            if (
              appointment.session.status === 'RESERVED' &&
              consumed.count !== 1
            ) {
              throw new ConflictException(
                'Ayrılmış paket seansı işlem sırasında değişti. Lütfen ekranı yenileyin.',
              );
            }

            if (consumed.count === 1) {
              const remaining = await tx.session.count({
                where: {
                  customerPackageId: appointment.session.customerPackageId,
                  status: {
                    in: ['AVAILABLE', 'RESERVED'],
                  },
                },
              });

              if (remaining === 0) {
                await tx.customerPackage.updateMany({
                  where: {
                    id: appointment.session.customerPackageId,
                    tenantId,
                    branchId: appointment.branchId,
                    status: 'ACTIVE',
                  },
                  data: {
                    status: 'COMPLETED',
                  },
                });
              }
            }
          }
        }

        const updatedAppointment = await tx.appointment.findUnique({
          where: { id: updated.id },
          include: {
            customer: {
              select: { firstName: true, lastName: true },
            },
            service: {
              select: { name: true, price: true },
            },
            payment: true,
            session: {
              include: {
                customerPackage: {
                  include: { package: true },
                },
              },
            },
          },
        });

        const statusChanged =
          input.status !== undefined && input.status !== appointment.status;
        const scheduleChanged =
          (input.startAt !== undefined &&
            input.startAt.getTime() !== appointment.startAt.getTime()) ||
          (input.endAt !== undefined &&
            input.endAt.getTime() !== appointment.endAt.getTime());

        if (
          statusChanged &&
          input.status === 'COMPLETED' &&
          updatedAppointment &&
          !updatedAppointment.session
        ) {
          const amount = Number(updatedAppointment.service.price);
          const actorId = await this.currentUserId(tx);
          const customerName =
            `${updatedAppointment.customer.firstName} ${updatedAppointment.customer.lastName}`.trim();
          const completedAt = new Date();

          await this.accountingService.recordAppointmentReceivable(
            tx,
            updatedAppointment.id,
            {
              tenantId,
              branchId: updatedAppointment.branchId,
              entryDate: completedAt,
              amount,
            },
          );
          await this.commerceFinanceSync.syncAppointmentReceivable(tx, {
            tenantId,
            companyId: this.tenantContext.getCompanyId(),
            branchId: updatedAppointment.branchId,
            appointmentId: updatedAppointment.id,
            actorId,
            customerName,
            serviceName: updatedAppointment.service.name,
            amount,
            occurredAt: completedAt,
            dueAt: updatedAppointment.startAt,
          });
        }

        if (statusChanged || scheduleChanged) {
          const eventType = statusChanged
            ? input.status === 'COMPLETED'
              ? 'APPOINTMENT_COMPLETED'
              : input.status === 'CANCELLED'
                ? 'APPOINTMENT_CANCELLED'
                : input.status === 'NO_SHOW'
                  ? 'APPOINTMENT_NO_SHOW'
                  : input.status === 'CONFIRMED'
                    ? 'APPOINTMENT_CONFIRMED'
                    : 'APPOINTMENT_UPDATED'
            : 'APPOINTMENT_RESCHEDULED';

          await this.recordCrmAppointmentEvent(tx, {
            customerId: updated.customerId,
            appointmentId: updated.id,
            branchId: updated.branchId,
            eventType,
            metadata: {
              previousStatus: appointment.status,
              status: updated.status,
              startAt: updated.startAt.toISOString(),
              endAt: updated.endAt.toISOString(),
              staffId: updated.staffId,
              serviceId: updated.serviceId,
            },
          });
        }

        if (updatedAppointment) {
          eventId =
            (await this.domainEvents?.record(tx, {
              eventName:
                input.status === 'COMPLETED'
                  ? 'appointment.completed'
                  : input.status === 'CANCELLED'
                    ? 'appointment.cancelled'
                    : input.status === 'NO_SHOW'
                      ? 'appointment.no_show'
                      : input.status === 'CONFIRMED'
                        ? 'appointment.confirmed'
                        : 'appointment.updated',
              aggregateType: 'appointment',
              aggregateId: updatedAppointment.id,
              payload: {
                customerId: updatedAppointment.customerId,
                serviceId: updatedAppointment.serviceId,
                staffId: updatedAppointment.staffId,
                status: updatedAppointment.status,
                startAt: updatedAppointment.startAt.toISOString(),
                sessionId: updatedAppointment.session?.id ?? null,
              },
            })) ?? null;
        }

        return updatedAppointment;
      });
      if (eventId) await this.domainEvents?.dispatchStored(eventId);
      return result;
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof ConflictException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }

      console.error('[AppointmentsService.update] Prisma error:', error);

      throw new InternalServerErrorException('Randevu güncellenemedi.');
    }
  }

  async remove(id: string) {
    const organizationScope =
      await this.organizationScope.getBranchScopedWhere();

    try {
      let eventId: string | null = null;
      const result = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRawUnsafe<Array<{ locked: number }>>(
          `SELECT 1::int AS locked
           FROM (
             SELECT pg_advisory_xact_lock(hashtext($1))
           ) AS advisory_lock`,
          `appointment:${id}`,
        );

        const appointment = await tx.appointment.findFirst({
          where: {
            id,
            ...organizationScope,
          },
          include: {
            session: true,
          },
        });

        if (!appointment) {
          throw new NotFoundException('Randevu bulunamadı.');
        }

        if (appointment.status === 'CANCELLED') {
          throw new BadRequestException('Randevu zaten iptal edilmiş.');
        }

        if (appointment.status === 'COMPLETED') {
          throw new ConflictException(
            'Tamamlanmış randevu iptal edilemez.',
          );
        }

        const updated = await tx.appointment.update({
          where: { id: appointment.id },
          data: { status: 'CANCELLED' },
        });

        if (appointment.session?.status === 'RESERVED') {
          const released = await tx.session.updateMany({
            where: {
              id: appointment.session.id,
              tenantId: appointment.tenantId,
              branchId: appointment.branchId,
              status: 'RESERVED',
              appointmentId: appointment.id,
            },
            data: {
              status: 'AVAILABLE',
              appointmentId: null,
            },
          });

          if (released.count !== 1) {
            throw new ConflictException(
              'Ayrılmış paket seansı iptal sırasında değişti. Lütfen ekranı yenileyin.',
            );
          }
        }

        await this.recordCrmAppointmentEvent(tx, {
          customerId: updated.customerId,
          appointmentId: updated.id,
          branchId: updated.branchId,
          eventType: 'APPOINTMENT_CANCELLED',
          metadata: {
            previousStatus: appointment.status,
            status: updated.status,
            startAt: updated.startAt.toISOString(),
            endAt: updated.endAt.toISOString(),
            staffId: updated.staffId,
            serviceId: updated.serviceId,
          },
        });

        eventId =
          (await this.domainEvents?.record(tx, {
            eventName: 'appointment.cancelled',
            aggregateType: 'appointment',
            aggregateId: updated.id,
            payload: {
              customerId: updated.customerId,
              serviceId: updated.serviceId,
              staffId: updated.staffId,
              status: updated.status,
              startAt: updated.startAt.toISOString(),
              releasedSessionId: appointment.session?.id ?? null,
            },
          })) ?? null;

        return {
          cancelled: true,
          appointment: updated,
        };
      });
      if (eventId) await this.domainEvents?.dispatchStored(eventId);
      return result;
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof ConflictException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }

      console.error('[AppointmentsService.remove] Prisma error:', error);

      throw new InternalServerErrorException('Randevu iptal edilemedi.');
    }
  }
}
