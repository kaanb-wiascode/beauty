import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';

import { TenantContext } from '../../common/tenant/tenant-context';
import { CreateAppointmentInput } from './dto/create-appointment.dto';
import { ListAppointmentsInput } from './dto/list-appointments.dto';
import { UpdateAppointmentInput } from './dto/update-appointment.dto';

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  private getTenantId(): string {
    const tenantId = this.tenantContext.getTenantId();

    if (!tenantId) {
      throw new InternalServerErrorException(
        'Tenant context is missing',
      );
    }

    return tenantId;
  }

  private requireBranchId(): string {
    const branchId = this.tenantContext.getBranchId();

    if (!branchId) {
      throw new BadRequestException(
        'A branch must be selected for this operation.',
      );
    }

    return branchId;
  }

  private getAppointmentScope() {
    const tenantId = this.tenantContext.getTenantId();
    const companyId = this.tenantContext.getCompanyId();
    const branchId = this.tenantContext.getBranchId();
    const roleScope = this.tenantContext.getRoleScope();

    if (roleScope === 'CENTRAL' && branchId === null) {
      return {
        tenantId,
        branch: {
          companyId,
        },
      };
    }

    return {
      tenantId,
      branchId: this.requireBranchId(),
    };
  }

  private validateDateRange(
    startAt: Date,
    endAt: Date,
  ): void {
    if (
      Number.isNaN(startAt.getTime()) ||
      Number.isNaN(endAt.getTime())
    ) {
      throw new BadRequestException(
        'Invalid appointment date',
      );
    }

    if (startAt >= endAt) {
      throw new BadRequestException(
        'Appointment startAt must be before endAt',
      );
    }
  }

  private async validateReferences(
    tenantId: string,
    input: {
      customerId: string;
      staffId: string;
      serviceId: string;
    },
    branchId: string,
  ): Promise<void> {
    const [customer, staff, service] =
      await Promise.all([
        this.prisma.customer.findFirst({
          where: {
            id: input.customerId,
            tenantId,
            branchId,
          },
          select: { id: true },
        }),
        this.prisma.staff.findFirst({
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
        this.prisma.service.findFirst({
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
      throw new NotFoundException('Customer not found');
    }

    if (!staff) {
      throw new NotFoundException('Staff not found');
    }

    if (!service) {
      throw new NotFoundException('Service not found');
    }

    if (staff.status !== 'ACTIVE') {
      throw new BadRequestException('Staff is not active');
    }

    if (service.status !== 'ACTIVE') {
      throw new BadRequestException('Service is not active');
    }
  }

  private async ensureNoStaffOverlap(
    tenantId: string,
    branchId: string,
    staffId: string,
    startAt: Date,
    endAt: Date,
    excludeId?: string,
  ): Promise<void> {
    const conflict =
      await this.prisma.appointment.findFirst({
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
      throw new BadRequestException(
        'Staff already has an overlapping appointment',
      );
    }
  }

  async findEligibleSessions(
    customerId: string,
    serviceId: string,
  ) {
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
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: new Date() } },
          ],
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
      tenantId,
      {
        customerId: input.customerId,
        staffId: input.staffId,
        serviceId: input.serviceId,
      },
      branchId,
    );

    await this.ensureNoStaffOverlap(
      tenantId,
      branchId,
      input.staffId,
      input.startAt,
      input.endAt,
    );

    try {
      return await this.prisma.$transaction(async (tx) => {
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
                OR: [
                  { expiresAt: null },
                  { expiresAt: { gt: new Date() } },
                ],
              },
            },
            select: { id: true },
          });

          if (!session) {
            throw new BadRequestException(
              'Selected session is not available for this customer, service, or branch.',
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
              status: 'AVAILABLE',
              appointmentId: null,
            },
            data: {
              status: 'RESERVED',
              appointmentId: appointment.id,
            },
          });

          if (reserved.count !== 1) {
            throw new BadRequestException(
              'Selected session was reserved by another operation. Please choose another session.',
            );
          }
        }

        return tx.appointment.findUnique({
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
      });
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      console.error(
        '[AppointmentsService.create] Prisma error:',
        error,
      );

      throw new InternalServerErrorException(
        'Failed to create appointment',
      );
    }
  }

  async findAll(input: ListAppointmentsInput) {
    const {
      page,
      limit,
      status,
      staffId,
      customerId,
      serviceId,
      from,
      to,
    } = input;

    if (from && to && from > to) {
      throw new BadRequestException('from must be before to');
    }

    const skip = (page - 1) * limit;

    const where = {
      ...this.getAppointmentScope(),
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
    const appointment =
      await this.prisma.appointment.findFirst({
        where: {
          id,
          ...this.getAppointmentScope(),
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
      throw new NotFoundException('Appointment not found');
    }

    return appointment;
  }

  async update(
    id: string,
    input: UpdateAppointmentInput,
  ) {
    const tenantId = this.getTenantId();

    const appointment =
      await this.prisma.appointment.findFirst({
        where: {
          id,
          ...this.getAppointmentScope(),
        },
        include: {
          session: true,
        },
      });

    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }

    if (
      appointment.status === 'CANCELLED' &&
      input.status !== 'CANCELLED'
    ) {
      throw new BadRequestException(
        'Cancelled appointment cannot be reactivated',
      );
    }

    const customerId = input.customerId ?? appointment.customerId;
    const staffId = input.staffId ?? appointment.staffId;
    const serviceId = input.serviceId ?? appointment.serviceId;
    const startAt = input.startAt ?? appointment.startAt;
    const endAt = input.endAt ?? appointment.endAt;

    this.validateDateRange(startAt, endAt);

    await this.validateReferences(
      tenantId,
      { customerId, staffId, serviceId },
      appointment.branchId,
    );

    await this.ensureNoStaffOverlap(
      tenantId,
      appointment.branchId,
      staffId,
      startAt,
      endAt,
      id,
    );

    if (
      appointment.session &&
      (customerId !== appointment.customerId ||
        serviceId !== appointment.serviceId)
    ) {
      const matchingSession = await this.prisma.session.findFirst({
        where: {
          id: appointment.session.id,
          serviceId,
          customerPackage: { customerId },
        },
        select: { id: true },
      });

      if (!matchingSession) {
        throw new BadRequestException(
          'Customer or service cannot be changed while the reserved package session does not match.',
        );
      }
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
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
          if (
            input.status === 'CANCELLED' ||
            input.status === 'NO_SHOW'
          ) {
            if (appointment.session.status === 'RESERVED') {
              await tx.session.update({
                where: { id: appointment.session.id },
                data: {
                  status: 'AVAILABLE',
                  appointmentId: null,
                },
              });
            }
          }

          if (
            input.status === 'COMPLETED' &&
            appointment.session.status === 'RESERVED'
          ) {
            await tx.session.update({
              where: { id: appointment.session.id },
              data: {
                status: 'CONSUMED',
                consumedAt: new Date(),
              },
            });

            const remaining = await tx.session.count({
              where: {
                customerPackageId:
                  appointment.session.customerPackageId,
                status: {
                  in: ['AVAILABLE', 'RESERVED'],
                },
              },
            });

            if (remaining === 0) {
              await tx.customerPackage.update({
                where: {
                  id: appointment.session.customerPackageId,
                },
                data: {
                  status: 'COMPLETED',
                },
              });
            }
          }
        }

        return tx.appointment.findUnique({
          where: { id: updated.id },
          include: {
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
      });
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      console.error(
        '[AppointmentsService.update] Prisma error:',
        error,
      );

      throw new InternalServerErrorException(
        'Failed to update appointment',
      );
    }
  }

  async remove(id: string) {
    const appointment =
      await this.prisma.appointment.findFirst({
        where: {
          id,
          ...this.getAppointmentScope(),
        },
        include: {
          session: true,
        },
      });

    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }

    if (appointment.status === 'CANCELLED') {
      throw new BadRequestException(
        'Appointment is already cancelled',
      );
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const updated = await tx.appointment.update({
          where: { id: appointment.id },
          data: { status: 'CANCELLED' },
        });

        if (appointment.session?.status === 'RESERVED') {
          await tx.session.update({
            where: { id: appointment.session.id },
            data: {
              status: 'AVAILABLE',
              appointmentId: null,
            },
          });
        }

        return {
          cancelled: true,
          appointment: updated,
        };
      });
    } catch (error) {
      console.error(
        '[AppointmentsService.remove] Prisma error:',
        error,
      );

      throw new InternalServerErrorException(
        'Failed to cancel appointment',
      );
    }
  }
}
