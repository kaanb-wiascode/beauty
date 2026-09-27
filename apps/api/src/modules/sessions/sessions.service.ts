import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import { DomainEventsService } from '../../infrastructure/domain-events/domain-events.service';
import { canTransitionSession } from '../commerce/domain/session-policy';

@Injectable()
export class SessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
    private readonly domainEvents?: DomainEventsService,
  ) {}

  private requireBranchId(): string {
    const branchId = this.tenantContext.getBranchId();
    if (!branchId) {
      throw new BadRequestException(
        'Bu işlem için önce aktif bir şube seçmelisiniz.',
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
        `Bu seans mevcut durumundan istenen duruma geçirilemez.`,
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
    if (!session) throw new NotFoundException('Seans bulunamadı.');
    return session;
  }

  async reserve(id: string, appointmentId: string) {
    const tenantId = this.tenantContext.getTenantId();
    const branchId = this.requireBranchId();
    const session = await this.findOne(id);
    this.assertTransition(session.status, 'RESERVED');

    const result = await this.prisma.$transaction(async (tx) => {
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
          'Randevu; müşteri, hizmet veya şube bilgileriyle eşleşmiyor.',
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
          'Seans artık randevuya ayrılabilir durumda değil.',
        );
      }

      return tx.session.findUnique({ where: { id: session.id } });
    });
    await this.domainEvents?.publish({
      eventName: 'session.reserved',
      aggregateType: 'session',
      aggregateId: session.id,
      payload: { appointmentId, customerPackageId: session.customerPackageId },
    });
    return result;
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
        'Seans durumu değiştiği için rezervasyon kaldırılamadı. Lütfen ekranı yenileyin.',
      );
    }

    const result = await this.prisma.session.findUnique({ where: { id: session.id } });
    await this.domainEvents?.publish({
      eventName: 'session.released',
      aggregateType: 'session',
      aggregateId: session.id,
      payload: { appointmentId: session.appointmentId },
    });
    return result;
  }

  async consume(id: string) {
    const tenantId = this.tenantContext.getTenantId();
    const branchId = this.requireBranchId();
    const session = await this.findOne(id);
    this.assertTransition(session.status, 'CONSUMED');

    if (!session.appointmentId) {
      throw new BadRequestException(
        'Seansın kullanılabilmesi için önce bir randevuya ayrılmış olması gerekir.',
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
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
          'Seansı kullanılmış olarak işaretlemeden önce bağlı randevu tamamlanmalıdır.',
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
          'Seans durumu değiştiği için kullanım kaydı tamamlanamadı. Lütfen ekranı yenileyin.',
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
    await this.domainEvents?.publish({
      eventName: 'session.consumed',
      aggregateType: 'session',
      aggregateId: session.id,
      payload: {
        appointmentId: session.appointmentId,
        customerPackageId: session.customerPackageId,
      },
    });
    return result;
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
        'Seans durumu değiştiği için iptal işlemi tamamlanamadı. Lütfen ekranı yenileyin.',
      );
    }

    const result = await this.prisma.session.findUnique({ where: { id: session.id } });
    await this.domainEvents?.publish({
      eventName: 'session.cancelled',
      aggregateType: 'session',
      aggregateId: session.id,
      payload: { previousAppointmentId: session.appointmentId },
    });
    return result;
  }
}
