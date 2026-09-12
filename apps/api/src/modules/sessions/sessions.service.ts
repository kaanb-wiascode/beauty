import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import { canTransitionSession } from '../commerce/domain/session-policy';

@Injectable()
export class SessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
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

  private assertTransition(
    from: 'AVAILABLE' | 'RESERVED' | 'CONSUMED' | 'CANCELLED',
    to: 'AVAILABLE' | 'RESERVED' | 'CONSUMED' | 'CANCELLED',
  ) {
    if (!canTransitionSession(from, to)) {
      throw new ConflictException(
        `Session cannot transition from ${from} to ${to}.`,
      );
    }
  }

  async findAll(input: {
    customerPackageId?: string;
    status?: 'AVAILABLE' | 'RESERVED' | 'CONSUMED' | 'CANCELLED';
  }) {
    const tenantId = this.tenantContext.getTenantId();
    const branchId = this.requireBranchId();
    return this.prisma.session.findMany({
      where: {
        tenantId,
        branchId,
        ...(input.customerPackageId && {
          customerPackageId: input.customerPackageId,
        }),
        ...(input.status && { status: input.status }),
      },
      include: {
        service: true,
        appointment: true,
        customerPackage: {
          include: { package: true, customer: true },
        },
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
        customerPackage: {
          include: { package: true, customer: true },
        },
      },
    });
    if (!session) throw new NotFoundException('Session not found');
    return session;
  }

  async reserve(id: string, appointmentId: string) {
    const tenantId = this.tenantContext.getTenantId();
    const branchId = this.requireBranchId();
    const session = await this.findOne(id);
    this.assertTransition(session.status, 'RESERVED');

    return this.prisma.$transaction(async (tx) => {
      const appointment = await tx.appointment.findFirst({
        where: {
          id: appointmentId,
          tenantId,
          branchId,
          customerId: session.customerPackage.customerId,
          serviceId: session.serviceId,
          status: { in: ['SCHEDULED', 'CONFIRMED'] },
        },
        select: { id: true },
      });

      if (!appointment) {
        throw new BadRequestException(
          'Appointment does not match this customer, service, or branch.',
        );
      }

      const claimed = await tx.session.updateMany({
        where: {
          id: session.id,
          tenantId,
          branchId,
          status: session.status,
          appointmentId: null,
        },
        data: {
          status: 'RESERVED',
          appointmentId,
        },
      });

      if (claimed.count !== 1) {
        throw new ConflictException(
          'Session is no longer available for reservation.',
        );
      }

      return tx.session.findUnique({ where: { id: session.id } });
    });
  }

  async release(id: string) {
    const tenantId = this.tenantContext.getTenantId();
    const branchId = this.requireBranchId();
    const session = await this.findOne(id);
    this.assertTransition(session.status, 'AVAILABLE');

    const claimed = await this.prisma.session.updateMany({
      where: {
        id: session.id,
        tenantId,
        branchId,
        status: session.status,
        appointmentId: session.appointmentId,
      },
      data: {
        status: 'AVAILABLE',
        appointmentId: null,
      },
    });

    if (claimed.count !== 1) {
      throw new ConflictException(
        'Session state changed before it could be released.',
      );
    }

    return this.prisma.session.findUnique({ where: { id: session.id } });
  }

  async consume(id: string) {
    const tenantId = this.tenantContext.getTenantId();
    const branchId = this.requireBranchId();
    const session = await this.findOne(id);
    this.assertTransition(session.status, 'CONSUMED');

    if (!session.appointmentId) {
      throw new BadRequestException(
        'A reserved appointment is required before consuming a session.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const appointment = await tx.appointment.findFirst({
        where: {
          id: session.appointmentId!,
          tenantId,
          branchId,
          status: 'COMPLETED',
        },
        select: { id: true },
      });

      if (!appointment) {
        throw new BadRequestException(
          'The linked appointment must be completed first.',
        );
      }

      const claimed = await tx.session.updateMany({
        where: {
          id: session.id,
          tenantId,
          branchId,
          status: session.status,
          appointmentId: session.appointmentId,
        },
        data: {
          status: 'CONSUMED',
          consumedAt: new Date(),
        },
      });

      if (claimed.count !== 1) {
        throw new ConflictException(
          'Session state changed before it could be consumed.',
        );
      }

      const remaining = await tx.session.count({
        where: {
          customerPackageId: session.customerPackageId,
          status: { in: ['AVAILABLE', 'RESERVED'] },
        },
      });

      if (remaining === 0) {
        await tx.customerPackage.updateMany({
          where: {
            id: session.customerPackageId,
            tenantId,
            branchId,
            status: 'ACTIVE',
          },
          data: { status: 'COMPLETED' },
        });
      }

      return tx.session.findUnique({ where: { id: session.id } });
    });
  }

  async cancel(id: string) {
    const tenantId = this.tenantContext.getTenantId();
    const branchId = this.requireBranchId();
    const session = await this.findOne(id);
    this.assertTransition(session.status, 'CANCELLED');

    const claimed = await this.prisma.session.updateMany({
      where: {
        id: session.id,
        tenantId,
        branchId,
        status: session.status,
        appointmentId: session.appointmentId,
      },
      data: {
        status: 'CANCELLED',
        appointmentId: null,
      },
    });

    if (claimed.count !== 1) {
      throw new ConflictException(
        'Session state changed before it could be cancelled.',
      );
    }

    return this.prisma.session.findUnique({ where: { id: session.id } });
  }
}
