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
  ): Promise<void> {
    const [customer, staff, service] =
      await Promise.all([
        this.prisma.customer.findFirst({
          where: {
            id: input.customerId,
            tenantId,
          },
          select: {
            id: true,
          },
        }),

        this.prisma.staff.findFirst({
          where: {
            id: input.staffId,
            tenantId,
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
          },
          select: {
            id: true,
            status: true,
          },
        }),
      ]);

    if (!customer) {
      throw new NotFoundException(
        'Customer not found',
      );
    }

    if (!staff) {
      throw new NotFoundException(
        'Staff not found',
      );
    }

    if (!service) {
      throw new NotFoundException(
        'Service not found',
      );
    }

    if (staff.status !== 'ACTIVE') {
      throw new BadRequestException(
        'Staff is not active',
      );
    }

    if (service.status !== 'ACTIVE') {
      throw new BadRequestException(
        'Service is not active',
      );
    }
  }

  private async ensureNoStaffOverlap(
    tenantId: string,
    staffId: string,
    startAt: Date,
    endAt: Date,
    excludeId?: string,
  ): Promise<void> {
    const conflict =
      await this.prisma.appointment.findFirst({
        where: {
          tenantId,
          staffId,

          ...(excludeId
            ? {
                id: {
                  not: excludeId,
                },
              }
            : {}),

          status: {
            notIn: [
              'CANCELLED',
              'NO_SHOW',
            ],
          },

          startAt: {
            lt: endAt,
          },

          endAt: {
            gt: startAt,
          },
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

  async create(input: CreateAppointmentInput) {
    const tenantId = this.getTenantId();

    this.validateDateRange(
      input.startAt,
      input.endAt,
    );

    await this.validateReferences(
      tenantId,
      {
        customerId: input.customerId,
        staffId: input.staffId,
        serviceId: input.serviceId,
      },
    );

    await this.ensureNoStaffOverlap(
      tenantId,
      input.staffId,
      input.startAt,
      input.endAt,
    );

    try {
      return await this.prisma.appointment.create({
        data: {
          tenantId,
          customerId: input.customerId,
          staffId: input.staffId,
          serviceId: input.serviceId,
          startAt: input.startAt,
          endAt: input.endAt,
          notes: input.notes?.trim() || null,
        },
      });
    } catch (error) {
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
    const tenantId = this.getTenantId();

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
      throw new BadRequestException(
        'from must be before to',
      );
    }

    const skip = (page - 1) * limit;

    const where = {
      tenantId,

      ...(status ? { status } : {}),

      ...(staffId ? { staffId } : {}),

      ...(customerId ? { customerId } : {}),

      ...(serviceId ? { serviceId } : {}),

      ...(from || to
        ? {
            AND: [
              ...(from
                ? [
                    {
                      endAt: {
                        gt: from,
                      },
                    },
                  ]
                : []),
              ...(to
                ? [
                    {
                      startAt: {
                        lt: to,
                      },
                    },
                  ]
                : []),
            ],
          }
        : {}),
    };

    const [data, total] =
      await Promise.all([
        this.prisma.appointment.findMany({
          where,
          skip,
          take: limit,
          orderBy: {
            startAt: 'asc',
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
            },
        }),

        this.prisma.appointment.count({
          where,
        }),
      ]);

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(
          total / limit,
        ),
      },
    };
  }

  async findOne(id: string) {
    const tenantId = this.getTenantId();

    const appointment =
      await this.prisma.appointment.findFirst({
        where: {
          id,
          tenantId,
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
          },
      });

    if (!appointment) {
      throw new NotFoundException(
        'Appointment not found',
      );
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
          tenantId,
        },
      });

    if (!appointment) {
      throw new NotFoundException(
        'Appointment not found',
      );
    }

    /*
     * Cancelled appointments are intentionally not
     * allowed to be modified back into an active
     * appointment through PATCH.
     */
    if (
      appointment.status === 'CANCELLED' &&
      input.status !== 'CANCELLED'
    ) {
      throw new BadRequestException(
        'Cancelled appointment cannot be reactivated',
      );
    }

    const customerId =
      input.customerId ??
      appointment.customerId;

    const staffId =
      input.staffId ??
      appointment.staffId;

    const serviceId =
      input.serviceId ??
      appointment.serviceId;

    const startAt =
      input.startAt ??
      appointment.startAt;

    const endAt =
      input.endAt ??
      appointment.endAt;

    this.validateDateRange(
      startAt,
      endAt,
    );

    await this.validateReferences(
      tenantId,
      {
        customerId,
        staffId,
        serviceId,
      },
    );

    await this.ensureNoStaffOverlap(
      tenantId,
      staffId,
      startAt,
      endAt,
      id,
    );

    try {
      return await this.prisma.appointment.update({
        where: {
          id,
        },

        data: {
          ...(input.customerId !== undefined && {
            customerId:
              input.customerId,
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
            notes:
              input.notes.trim() || null,
          }),

          ...(input.status !== undefined && {
            status: input.status,
          }),
        },
      });
    } catch (error) {
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
    const tenantId = this.getTenantId();

    const appointment =
      await this.prisma.appointment.findFirst({
        where: {
          id,
          tenantId,
        },
        select: {
          id: true,
          status: true,
        },
      });

    if (!appointment) {
      throw new NotFoundException(
        'Appointment not found',
      );
    }

    if (appointment.status === 'CANCELLED') {
      throw new BadRequestException(
        'Appointment is already cancelled',
      );
    }

    try {
      const updated =
        await this.prisma.appointment.update({
          where: {
            id: appointment.id,
          },

          data: {
            status: 'CANCELLED',
          },
        });

      return {
        cancelled: true,
        appointment: updated,
      };
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
