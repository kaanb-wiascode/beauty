import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';

import { TenantContext } from '../../common/tenant/tenant-context';

export type CheckoutBlockerCode =
  | 'VISIT_NOT_CHECKOUT_PENDING'
  | 'PAYMENT_PENDING'
  | 'PACKAGE_SESSION_NOT_CONSUMED'
  | 'COMMERCIAL_CONTEXT_UNVERIFIED';

export interface VisitCheckoutIssue {
  code: CheckoutBlockerCode;
  appointmentId?: string;
  message: string;
}

export interface VisitCheckoutReadiness {
  visitId: string;
  visitStatus: string;
  appointmentIds: string[];
  canCheckout: boolean;
  blockers: VisitCheckoutIssue[];
  warnings: VisitCheckoutIssue[];
}

@Injectable()
export class VisitCheckoutReadinessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  private context() {
    const tenantId = this.tenantContext.getTenantId();
    const branchId = this.tenantContext.getBranchId();

    if (!tenantId) {
      throw new InternalServerErrorException('Tenant context is incomplete.');
    }

    if (!branchId) {
      throw new BadRequestException(
        'A branch must be selected for this operation.',
      );
    }

    return { tenantId, branchId };
  }

  async getReadiness(id: string): Promise<VisitCheckoutReadiness> {
    const { tenantId, branchId } = this.context();

    const visits = await this.prisma.$queryRawUnsafe<
      Array<{ id: string; status: string; source: 'APPOINTMENT' | 'WALK_IN' }>
    >(
      `SELECT "id", "status"::text AS "status", "source"::text AS "source"
       FROM "visits"
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

    const links = await this.prisma.$queryRawUnsafe<
      Array<{ appointmentId: string }>
    >(
      `SELECT va."appointmentId"
       FROM "visit_appointments" va
       INNER JOIN "appointments" a ON a."id" = va."appointmentId"
       WHERE va."visitId" = $1
         AND a."tenantId" = $2
         AND a."branchId" = $3
       ORDER BY va."createdAt" ASC`,
      id,
      tenantId,
      branchId,
    );

    const appointmentIds = links.map((item) => item.appointmentId);
    const appointments = appointmentIds.length
      ? await this.prisma.appointment.findMany({
          where: {
            id: { in: appointmentIds },
            tenantId,
            branchId,
          },
          select: {
            id: true,
            payment: { select: { status: true } },
            session: { select: { status: true } },
          },
        })
      : [];

    const blockers: VisitCheckoutIssue[] = [];
    const warnings: VisitCheckoutIssue[] = [];

    if (visit.status !== 'CHECKOUT_PENDING') {
      blockers.push({
        code: 'VISIT_NOT_CHECKOUT_PENDING',
        message: 'Visit must be checkout pending before checkout.',
      });
    }

    for (const appointment of appointments) {
      if (appointment.session) {
        if (appointment.session.status !== 'CONSUMED') {
          blockers.push({
            code: 'PACKAGE_SESSION_NOT_CONSUMED',
            appointmentId: appointment.id,
            message: 'The package session linked to this appointment has not been consumed.',
          });
        }
        continue;
      }

      if (!appointment.payment || appointment.payment.status !== 'COMPLETED') {
        blockers.push({
          code: 'PAYMENT_PENDING',
          appointmentId: appointment.id,
          message: 'Payment or collection is still pending for this appointment.',
        });
      }
    }

    if (visit.source === 'WALK_IN' && appointmentIds.length === 0) {
      blockers.push({
        code: 'COMMERCIAL_CONTEXT_UNVERIFIED',
        message:
          'Walk-in commercial context is not linked to Visit yet; sale/payment state must be verified before checkout.',
      });
    }

    return {
      visitId: visit.id,
      visitStatus: visit.status,
      appointmentIds,
      canCheckout: blockers.length === 0,
      blockers,
      warnings,
    };
  }

  async assertCanCheckout(id: string) {
    const readiness = await this.getReadiness(id);
    if (!readiness.canCheckout) {
      throw new BadRequestException({
        message: 'Visit is not ready for checkout.',
        blockers: readiness.blockers,
      });
    }
    return readiness;
  }
}
