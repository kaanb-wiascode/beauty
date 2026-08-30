import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import { PrismaService } from "@beauty-erp/database";

import { TenantContext } from "../../common/tenant/tenant-context";
import { CreateCareEventInput } from "./dto/create-care-event.dto";
import { UpdateCareEventInput } from "./dto/update-care-event.dto";

@Injectable()
export class CareEventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  private requireBranchId(): string {
    const branchId = this.tenantContext.getBranchId();

    if (!branchId) {
      throw new BadRequestException(
        "A branch must be selected for this operation.",
      );
    }

    return branchId;
  }

  private getCustomerScope() {
    const tenantId = this.tenantContext.getTenantId();
    const companyId = this.tenantContext.getCompanyId();
    const branchId = this.tenantContext.getBranchId();
    const roleScope = this.tenantContext.getRoleScope();

    if (roleScope === "CENTRAL" && branchId === null) {
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

  private async ensureCustomer(customerId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: {
        id: customerId,
        ...this.getCustomerScope(),
      },
      select: {
        id: true,
        branchId: true,
      },
    });

    if (!customer) {
      throw new NotFoundException("Customer not found");
    }

    return customer;
  }

  private async ensureAppointment(
    customerId: string,
    appointmentId: string,
  ) {
    const tenantId = this.tenantContext.getTenantId();

    const appointment = await this.prisma.appointment.findFirst({
      where: {
        id: appointmentId,
        tenantId,
        customerId,
      },
      select: {
        id: true,
      },
    });

    if (!appointment) {
      throw new BadRequestException(
        "Selected appointment does not belong to this customer.",
      );
    }
  }

  private async ensureStaff(staffId: string) {
    const tenantId = this.tenantContext.getTenantId();

    const staff = await this.prisma.staff.findFirst({
      where: {
        id: staffId,
        tenantId,
      },
      select: {
        id: true,
      },
    });

    if (!staff) {
      throw new BadRequestException(
        "Selected staff member does not belong to this salon.",
      );
    }
  }

  private getInclude() {
    return {
      appointment: {
        select: {
          id: true,
          startAt: true,
          service: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
      staff: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
    } as const;
  }

  async findAll(customerId: string) {
    const customer = await this.ensureCustomer(customerId);

    return this.prisma.customerCareEvent.findMany({
      where: {
        tenantId: this.tenantContext.getTenantId(),
        customerId,
        branchId: customer.branchId,
      },
      include: this.getInclude(),
      orderBy: {
        occurredAt: "desc",
      },
    });
  }

  async create(
    customerId: string,
    input: CreateCareEventInput,
  ) {
    const customer = await this.ensureCustomer(customerId);

    if (input.appointmentId) {
      await this.ensureAppointment(
        customerId,
        input.appointmentId,
      );
    }

    if (input.staffId) {
      await this.ensureStaff(input.staffId);
    }

    const resolved =
      input.status === "RESOLVED" ||
      input.status === "CLOSED";

    return this.prisma.customerCareEvent.create({
      data: {
        tenantId: this.tenantContext.getTenantId(),
        branchId: customer.branchId,
        customerId,
        appointmentId: input.appointmentId ?? null,
        staffId: input.staffId ?? null,
        type: input.type,
        status: input.status,
        severity: input.severity ?? null,
        title: input.title.trim(),
        description: input.description?.trim() || null,
        onsetAt: input.onsetAt ?? null,
        occurredAt: input.occurredAt ?? new Date(),
        actionTaken: input.actionTaken?.trim() || null,
        followUpAt: input.followUpAt ?? null,
        resolvedAt: resolved ? new Date() : null,
      },
      include: this.getInclude(),
    });
  }

  async update(
    customerId: string,
    eventId: string,
    input: UpdateCareEventInput,
  ) {
    const customer = await this.ensureCustomer(customerId);

    const event = await this.prisma.customerCareEvent.findFirst({
      where: {
        id: eventId,
        tenantId: this.tenantContext.getTenantId(),
        customerId,
        branchId: customer.branchId,
      },
      select: {
        id: true,
      },
    });

    if (!event) {
      throw new NotFoundException("Care event not found");
    }

    if (input.appointmentId) {
      await this.ensureAppointment(
        customerId,
        input.appointmentId,
      );
    }

    if (input.staffId) {
      await this.ensureStaff(input.staffId);
    }

    const resolved =
      input.status === "RESOLVED" ||
      input.status === "CLOSED";

    return this.prisma.customerCareEvent.update({
      where: {
        id: event.id,
      },
      data: {
        ...(input.appointmentId !== undefined && {
          appointmentId: input.appointmentId,
        }),
        ...(input.staffId !== undefined && {
          staffId: input.staffId,
        }),
        ...(input.type !== undefined && {
          type: input.type,
        }),
        ...(input.status !== undefined && {
          status: input.status,
        }),
        ...(input.severity !== undefined && {
          severity: input.severity,
        }),
        ...(input.title !== undefined && {
          title: input.title.trim(),
        }),
        ...(input.description !== undefined && {
          description: input.description?.trim() || null,
        }),
        ...(input.onsetAt !== undefined && {
          onsetAt: input.onsetAt,
        }),
        ...(input.occurredAt !== undefined && {
          occurredAt: input.occurredAt,
        }),
        ...(input.actionTaken !== undefined && {
          actionTaken: input.actionTaken?.trim() || null,
        }),
        ...(input.followUpAt !== undefined && {
          followUpAt: input.followUpAt,
        }),
        ...(input.resolvedAt !== undefined && {
          resolvedAt: input.resolvedAt,
        }),
        ...(resolved &&
          input.resolvedAt === undefined && {
            resolvedAt: new Date(),
          }),
      },
      include: this.getInclude(),
    });
  }

  async remove(
    customerId: string,
    eventId: string,
  ) {
    const customer = await this.ensureCustomer(customerId);

    const event = await this.prisma.customerCareEvent.findFirst({
      where: {
        id: eventId,
        tenantId: this.tenantContext.getTenantId(),
        customerId,
        branchId: customer.branchId,
      },
      select: {
        id: true,
      },
    });

    if (!event) {
      throw new NotFoundException("Care event not found");
    }

    await this.prisma.customerCareEvent.delete({
      where: {
        id: event.id,
      },
    });

    return {
      deleted: true,
      id: event.id,
    };
  }
}
