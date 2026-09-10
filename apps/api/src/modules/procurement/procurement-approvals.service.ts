import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

@Injectable()
export class ProcurementApprovalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  private companyId() {
    return this.tenantContext.getCompanyId();
  }

  private approvalLevels(totalAmount: number) {
    const levels: Array<{ level: number; role: string }> = [
      { level: 1, role: 'MANAGER' },
    ];
    if (totalAmount > 10_000) levels.push({ level: 2, role: 'FINANCE' });
    if (totalAmount > 50_000) levels.push({ level: 3, role: 'DIRECTOR' });
    return levels;
  }

  async submit(id: string) {
    const companyId = this.companyId();
    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.$queryRawUnsafe<any[]>(
          `SELECT id,status,total_amount AS "totalAmount"
           FROM inventory_purchase_orders
           WHERE id=$1::text AND company_id=$2::text
           FOR UPDATE`,
          id,
          companyId,
        );
        if (!rows.length) throw new NotFoundException('Purchase order not found');
        const order = rows[0];
        if (!['DRAFT', 'PENDING', 'APPROVED'].includes(order.status)) {
          throw new BadRequestException(`Purchase order cannot enter approval from status ${order.status}.`);
        }

        const existing = await tx.$queryRawUnsafe<any[]>(
          `SELECT id FROM inventory_purchase_order_approvals WHERE purchase_order_id=$1::text LIMIT 1`,
          id,
        );
        if (existing.length) {
          throw new BadRequestException('Purchase order approval workflow already exists.');
        }

        const levels = this.approvalLevels(Number(order.totalAmount));
        for (const approval of levels) {
          await tx.$executeRawUnsafe(
            `INSERT INTO inventory_purchase_order_approvals(purchase_order_id,level,required_role)
             VALUES($1::text,$2,$3)`,
            id,
            approval.level,
            approval.role,
          );
        }

        await tx.$executeRawUnsafe(
          `UPDATE inventory_purchase_orders SET status='PENDING',updated_at=NOW() WHERE id=$1::text`,
          id,
        );

        return this.getApprovalStateTx(tx, id);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async getApprovalStateTx(tx: Prisma.TransactionClient, id: string) {
    const orderRows = await tx.$queryRawUnsafe<any[]>(
      `SELECT id,status,total_amount AS "totalAmount" FROM inventory_purchase_orders WHERE id=$1::text LIMIT 1`,
      id,
    );
    const approvals = await tx.$queryRawUnsafe<any[]>(
      `SELECT id,level,required_role AS "requiredRole",status,
              approved_by_user_id AS "approvedByUserId",approved_at AS "approvedAt"
       FROM inventory_purchase_order_approvals
       WHERE purchase_order_id=$1::text ORDER BY level ASC`,
      id,
    );
    return { order: orderRows[0], approvals };
  }

  async getState(id: string) {
    const companyId = this.companyId();
    const exists = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id FROM inventory_purchase_orders WHERE id=$1::text AND company_id=$2::text LIMIT 1`,
      id,
      companyId,
    );
    if (!exists.length) throw new NotFoundException('Purchase order not found');
    return this.getApprovalStateTx(this.prisma, id);
  }

  async approve(id: string, level: number, userId: string) {
    const companyId = this.companyId();
    if (!Number.isInteger(level) || level <= 0) {
      throw new BadRequestException('Approval level must be a positive integer.');
    }

    return this.prisma.$transaction(
      async (tx) => {
        const orders = await tx.$queryRawUnsafe<any[]>(
          `SELECT id,status FROM inventory_purchase_orders
           WHERE id=$1::text AND company_id=$2::text FOR UPDATE`,
          id,
          companyId,
        );
        if (!orders.length) throw new NotFoundException('Purchase order not found');
        if (orders[0].status !== 'PENDING') {
          throw new BadRequestException('Only pending purchase orders can be approved.');
        }

        const approvals = await tx.$queryRawUnsafe<any[]>(
          `SELECT id,level,status FROM inventory_purchase_order_approvals
           WHERE purchase_order_id=$1::text ORDER BY level ASC FOR UPDATE`,
          id,
        );
        if (!approvals.length) throw new BadRequestException('Purchase order has no approval workflow.');

        const current = approvals.find((approval) => Number(approval.level) === level);
        if (!current) throw new NotFoundException('Approval level not found');
        if (current.status !== 'PENDING') {
          throw new BadRequestException('Approval level is not pending.');
        }
        const previousPending = approvals.some(
          (approval) => Number(approval.level) < level && approval.status !== 'APPROVED',
        );
        if (previousPending) {
          throw new BadRequestException('Previous approval levels must be completed first.');
        }

        await tx.$executeRawUnsafe(
          `UPDATE inventory_purchase_order_approvals
           SET status='APPROVED',approved_by_user_id=$3::text,approved_at=NOW()
           WHERE purchase_order_id=$1::text AND level=$2 AND status='PENDING'`,
          id,
          level,
          userId,
        );

        const remaining = await tx.$queryRawUnsafe<any[]>(
          `SELECT COUNT(*)::int AS count FROM inventory_purchase_order_approvals
           WHERE purchase_order_id=$1::text AND status<>'APPROVED'`,
          id,
        );
        if (Number(remaining[0]?.count ?? 0) === 0) {
          await tx.$executeRawUnsafe(
            `UPDATE inventory_purchase_orders SET status='APPROVED',updated_at=NOW() WHERE id=$1::text`,
            id,
          );
        }

        return this.getApprovalStateTx(tx, id);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async reject(id: string, level: number, userId: string) {
    const companyId = this.companyId();
    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.$queryRawUnsafe<any[]>(
          `SELECT id,status FROM inventory_purchase_orders
           WHERE id=$1::text AND company_id=$2::text FOR UPDATE`,
          id,
          companyId,
        );
        if (!rows.length) throw new NotFoundException('Purchase order not found');
        if (rows[0].status !== 'PENDING') {
          throw new BadRequestException('Only pending purchase orders can be rejected.');
        }

        const updated = await tx.$executeRawUnsafe(
          `UPDATE inventory_purchase_order_approvals
           SET status='REJECTED',approved_by_user_id=$3::text,approved_at=NOW()
           WHERE purchase_order_id=$1::text AND level=$2 AND status='PENDING'`,
          id,
          level,
          userId,
        );
        if (updated !== 1) throw new BadRequestException('Approval level is not rejectable.');

        await tx.$executeRawUnsafe(
          `UPDATE inventory_purchase_orders SET status='CANCELLED',updated_at=NOW() WHERE id=$1::text`,
          id,
        );
        return this.getApprovalStateTx(tx, id);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
