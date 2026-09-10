import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import { assertSessionTransition } from '../commerce/domain/session-policy';

@Injectable()
export class SessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  private requireBranchId(): string {
    const branchId = this.tenantContext.getBranchId();
    if (!branchId) throw new BadRequestException('A branch must be selected for this operation.');
    return branchId;
  }

  async findAll(input: { customerPackageId?: string; status?: 'AVAILABLE' | 'RESERVED' | 'CONSUMED' | 'CANCELLED' }) {
    const tenantId = this.tenantContext.getTenantId();
    const branchId = this.requireBranchId();
    return this.prisma.session.findMany({
      where: {
        tenantId,
        branchId,
        ...(input.customerPackageId && { customerPackageId: input.customerPackageId }),
        ...(input.status && { status: input.status }),
      },
      include: {
        service: true,
        appointment: true,
        customerPackage: { include: { package: true, customer: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findOne(id: string) {
    const tenantId = this.tenantContext.getTenantId();
    const branchId = this.requireBranchId();
    const session = await this.prisma.session.findFirst({
      where: { id, tenantId, branchId },
      include: {
        service: true,
        appointment: true,
        customerPackage: { include: { package: true, customer: true } },
      },
    });
    if (!session) throw new NotFoundException('Session not found');
    return session;
  }

  async reserve(id: string, appointmentId: string) {
    const session = await this.findOne(id);
    assertSessionTransition(session.status, 'RESERVED');

    const appointment = await this.prisma.appointment.findFirst({
      where: {
        id: appointmentId,
        tenantId: session.tenantId,
        branchId: session.branchId,
        customerId: session.customerPackage.customerId,
        serviceId: session.serviceId,
        status: { in: ['SCHEDULED', 'CONFIRMED'] },
      },
    });
    if (!appointment) {
      throw new BadRequestException('Appointment does not match this customer, service, or branch.');
    }

    return this.prisma.session.update({
      where: { id: session.id },
      data: { status: 'RESERVED', appointmentId },
    });
  }

  async release(id: string) {
    const session = await this.findOne(id);
    assertSessionTransition(session.status, 'AVAILABLE');
    return this.prisma.session.update({
      where: { id: session.id },
      data: { status: 'AVAILABLE', appointmentId: null },
    });
  }

  async consume(id: string) {
    const session = await this.findOne(id);
    assertSessionTransition(session.status, 'CONSUMED');
    if (!session.appointmentId) {
      throw new BadRequestException('A reserved appointment is required before consuming a session.');
    }

    const appointment = await this.prisma.appointment.findUnique({ where: { id: session.appointmentId } });
    if (!appointment || appointment.status !== 'COMPLETED') {
      throw new BadRequestException('The linked appointment must be completed first.');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.session.update({
        where: { id: session.id },
        data: { status: 'CONSUMED', consumedAt: new Date() },
      });

      const remaining = await tx.session.count({
        where: {
          customerPackageId: session.customerPackageId,
          status: { in: ['AVAILABLE', 'RESERVED'] },
        },
      });

      if (remaining === 0) {
        await tx.customerPackage.update({
          where: { id: session.customerPackageId },
          data: { status: 'COMPLETED' },
        });
      }

      return updated;
    });
  }

  async cancel(id: string) {
    const session = await this.findOne(id);
    assertSessionTransition(session.status, 'CANCELLED');
    return this.prisma.session.update({
      where: { id: session.id },
      data: { status: 'CANCELLED', appointmentId: null },
    });
  }
}
