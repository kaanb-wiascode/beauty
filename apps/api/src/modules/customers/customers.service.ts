import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';

import { OrganizationScopeService } from '../../common/tenant/organization-scope.service';
import { TenantContext } from '../../common/tenant/tenant-context';
import { CreateCustomerInput } from './dto/create-customer.dto';
import { ListCustomersInput } from './dto/list-customers.dto';
import { UpdateCustomerInput } from './dto/update-customer.dto';
import { UpdateHealthProfileInput } from './dto/update-health-profile.dto';

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
    private readonly organizationScope: OrganizationScopeService,
  ) {}

  private requireBranchId(): string {
    const branchId = this.tenantContext.getBranchId();

    if (!branchId) {
      throw new BadRequestException(
        'A branch must be selected for this operation.',
      );
    }

    return branchId;
  }

  async create(input: CreateCustomerInput) {
    const tenantId = this.tenantContext.getTenantId();
    const branchId = this.requireBranchId();

    const consents = input.consents ?? {
      kvkkAcknowledgement: false,
      explicitConsent: false,
      membershipAgreement: false,
      healthFormCompletion: false,
      healthDataConsent: false,
      marketingSms: false,
      marketingEmail: false,
      marketingPhone: false,
    };
    const healthProfile = input.healthProfile;

    const hasHealthData = Boolean(
      healthProfile &&
        Object.values(healthProfile).some((value) => value?.trim()),
    );

    if (hasHealthData && !consents.healthDataConsent) {
      throw new BadRequestException(
        'Sağlık bilgileri için sağlık verilerinin işlenmesine ilişkin açık rıza gereklidir.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const customer = await tx.customer.create({
        data: {
          tenantId,
          branchId,
          firstName: input.firstName.trim(),
          lastName: input.lastName.trim(),
          phone: input.phone?.trim() || null,
          email: input.email?.trim().toLowerCase() || null,
          birthDate: input.birthDate
            ? new Date(`${input.birthDate}T00:00:00.000Z`)
            : null,
          customerSource: input.customerSource,
        },
      });

      if (hasHealthData && healthProfile) {
        await tx.customerHealthProfile.create({
          data: {
            tenantId,
            branchId,
            customerId: customer.id,
            formVersion: '1.0',
            allergies: healthProfile.allergies?.trim() || null,
            sensitivities: healthProfile.sensitivities?.trim() || null,
            medications: healthProfile.medications?.trim() || null,
            conditions: healthProfile.conditions?.trim() || null,
            notes: healthProfile.notes?.trim() || null,
            confirmedAt: consents.healthFormCompletion ? new Date() : null,
          },
        });
      }

      const now = new Date();
      const consentRows = [
        ['KVKK_ACKNOWLEDGEMENT', consents.kvkkAcknowledgement],
        ['EXPLICIT_CONSENT', consents.explicitConsent],
        ['MEMBERSHIP_AGREEMENT', consents.membershipAgreement],
        ['HEALTH_FORM_COMPLETION', consents.healthFormCompletion],
        ['HEALTH_DATA_CONSENT', consents.healthDataConsent],
        ['MARKETING_SMS', consents.marketingSms],
        ['MARKETING_EMAIL', consents.marketingEmail],
        ['MARKETING_PHONE', consents.marketingPhone],
      ] as const;

      await tx.customerConsent.createMany({
        data: consentRows.map(([type, accepted]) => ({
          tenantId,
          branchId,
          customerId: customer.id,
          type,
          status: accepted ? ('ACCEPTED' as const) : ('DECLINED' as const),
          documentVersion: '1.0',
          acceptedAt: accepted ? now : null,
          source: 'STAFF' as const,
        })),
      });

      return customer;
    });
  }

  async findAll(input: ListCustomersInput) {
    const customerScope = await this.organizationScope.getBranchScopedWhere();
    const { page, limit, search } = input;
    const skip = (page - 1) * limit;

    const where = {
      ...customerScope,
      ...(search
        ? {
            OR: [
              { firstName: { contains: search, mode: 'insensitive' as const } },
              { lastName: { contains: search, mode: 'insensitive' as const } },
              { email: { contains: search, mode: 'insensitive' as const } },
              { phone: { contains: search } },
            ],
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.customer.count({ where }),
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
    const customerScope = await this.organizationScope.getBranchScopedWhere();
    const appointmentScope = await this.organizationScope.getBranchScopedWhere();

    const customer = await this.prisma.customer.findFirst({
      where: {
        id,
        ...customerScope,
      },
      include: {
        healthProfile: true,
        documents: {
          orderBy: { createdAt: 'desc' },
        },
        consents: {
          orderBy: { createdAt: 'desc' },
        },
        careEvents: {
          where: {
            ...customerScope,
          },
          include: {
            appointment: {
              select: {
                id: true,
                startAt: true,
                service: {
                  select: { id: true, name: true },
                },
              },
            },
            staff: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
          orderBy: { occurredAt: 'desc' },
        },
        appointments: {
          where: {
            ...appointmentScope,
          },
          include: {
            service: {
              select: {
                id: true,
                name: true,
                price: true,
                durationMinutes: true,
              },
            },
            staff: {
              select: { id: true, firstName: true, lastName: true },
            },
            payment: {
              select: {
                id: true,
                amount: true,
                method: true,
                status: true,
                paidAt: true,
                refundedAt: true,
                refundReason: true,
              },
            },
          },
          orderBy: { startAt: 'desc' },
        },
      },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const now = new Date();
    const totalAppointments = customer.appointments.length;
    const completedAppointments = customer.appointments.filter(
      (appointment) => appointment.status === 'COMPLETED',
    ).length;
    const upcomingAppointments = customer.appointments.filter(
      (appointment) =>
        appointment.startAt >= now &&
        appointment.status !== 'CANCELLED' &&
        appointment.status !== 'NO_SHOW',
    ).length;

    const customerPayments = customer.appointments
      .filter((appointment) => appointment.payment)
      .map((appointment) => ({
        id: appointment.payment!.id,
        appointmentId: appointment.id,
        amount: Number(appointment.payment!.amount),
        method: appointment.payment!.method,
        status: appointment.payment!.status,
        paidAt: appointment.payment!.paidAt,
        refundedAt: appointment.payment!.refundedAt,
        refundReason: appointment.payment!.refundReason,
        service: {
          id: appointment.service.id,
          name: appointment.service.name,
        },
      }))
      .sort(
        (a, b) =>
          new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime(),
      );

    const totalPaid = customerPayments
      .filter((payment) => payment.status === 'COMPLETED')
      .reduce((total, payment) => total + payment.amount, 0);
    const totalRefunded = customerPayments
      .filter((payment) => payment.status === 'REFUNDED')
      .reduce((total, payment) => total + payment.amount, 0);

    return {
      id: customer.id,
      tenantId: customer.tenantId,
      branchId: customer.branchId,
      firstName: customer.firstName,
      lastName: customer.lastName,
      phone: customer.phone,
      email: customer.email,
      birthDate: customer.birthDate,
      customerSource: customer.customerSource,
      createdAt: customer.createdAt,
      updatedAt: customer.updatedAt,
      healthProfile: customer.healthProfile,
      documents: customer.documents,
      consents: customer.consents,
      careEvents: customer.careEvents,
      stats: {
        totalAppointments,
        completedAppointments,
        upcomingAppointments,
        totalPaid,
        totalRefunded,
        netSpent: totalPaid - totalRefunded,
        lastPaymentAt: customerPayments[0]?.paidAt ?? null,
      },
      payments: customerPayments,
      appointments: customer.appointments,
    };
  }

  async update(id: string, input: UpdateCustomerInput) {
    const customerScope = await this.organizationScope.getBranchScopedWhere();

    const customer = await this.prisma.customer.findFirst({
      where: {
        id,
        ...customerScope,
      },
      select: { id: true },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    return this.prisma.customer.update({
      where: { id: customer.id },
      data: {
        ...(input.firstName !== undefined && {
          firstName: input.firstName.trim(),
        }),
        ...(input.lastName !== undefined && {
          lastName: input.lastName.trim(),
        }),
        ...(input.phone !== undefined && {
          phone: input.phone?.trim() || null,
        }),
        ...(input.email !== undefined && {
          email: input.email?.trim().toLowerCase() || null,
        }),
        ...(input.birthDate !== undefined && {
          birthDate: input.birthDate
            ? new Date(`${input.birthDate}T00:00:00.000Z`)
            : null,
        }),
        ...(input.customerSource !== undefined && {
          customerSource: input.customerSource,
        }),
      },
    });
  }

  async updateHealthProfile(
    customerId: string,
    input: UpdateHealthProfileInput,
  ) {
    const customerScope = await this.organizationScope.getBranchScopedWhere();

    const customer = await this.prisma.customer.findFirst({
      where: {
        id: customerId,
        ...customerScope,
      },
      select: {
        id: true,
        branchId: true,
      },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    return this.prisma.customerHealthProfile.upsert({
      where: { customerId: customer.id },
      create: {
        tenantId: this.tenantContext.getTenantId(),
        branchId: customer.branchId,
        customerId: customer.id,
        formVersion: '1.0',
        allergies: input.allergies?.trim() || null,
        sensitivities: input.sensitivities?.trim() || null,
        medications: input.medications?.trim() || null,
        conditions: input.conditions?.trim() || null,
        notes: input.notes?.trim() || null,
        confirmedAt: new Date(),
      },
      update: {
        ...(input.allergies !== undefined && {
          allergies: input.allergies?.trim() || null,
        }),
        ...(input.sensitivities !== undefined && {
          sensitivities: input.sensitivities?.trim() || null,
        }),
        ...(input.medications !== undefined && {
          medications: input.medications?.trim() || null,
        }),
        ...(input.conditions !== undefined && {
          conditions: input.conditions?.trim() || null,
        }),
        ...(input.notes !== undefined && {
          notes: input.notes?.trim() || null,
        }),
        confirmedAt: new Date(),
      },
    });
  }

  async remove(id: string) {
    const customerScope = await this.organizationScope.getBranchScopedWhere();

    const customer = await this.prisma.customer.findFirst({
      where: {
        id,
        ...customerScope,
      },
      select: { id: true },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    await this.prisma.customer.delete({
      where: { id: customer.id },
    });

    return {
      deleted: true,
      id,
    };
  }
}
