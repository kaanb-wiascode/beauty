import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';

import { TenantContext } from '../../common/tenant/tenant-context';

type ExpectedConsumableRow = {
  productId: string;
  productName: string;
  sku: string | null;
  unit: string;
  expectedQuantity: string;
};

type ActualConsumableRow = {
  movementId: string;
  productId: string;
  productName: string;
  sku: string | null;
  unit: string;
  actualQuantity: string;
  warehouseId: string;
  consumedAt: Date;
};

@Injectable()
export class OperationsConsumablesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  private context() {
    const tenantId = this.tenantContext.getTenantId();
    const companyId = this.tenantContext.getCompanyId();
    const branchId = this.tenantContext.getBranchId();

    if (!tenantId || !companyId) {
      throw new InternalServerErrorException(
        'Organization context is incomplete.',
      );
    }
    if (!branchId) {
      throw new BadRequestException(
        'A branch must be selected for this operation.',
      );
    }

    return { tenantId, companyId, branchId };
  }

  async executionSummary(executionId: string) {
    const { tenantId, companyId, branchId } = this.context();
    const executions = await this.prisma.$queryRawUnsafe<
      Array<{
        id: string;
        appointmentId: string;
        serviceId: string;
        status: string;
      }>
    >(
      `SELECT id, appointment_id AS "appointmentId", service_id AS "serviceId",
              status::text AS status
       FROM operations_service_executions
       WHERE id = $1 AND tenant_id = $2 AND company_id = $3 AND branch_id = $4
       LIMIT 1`,
      executionId,
      tenantId,
      companyId,
      branchId,
    );
    const execution = executions[0];
    if (!execution) throw new NotFoundException('Service execution not found');

    const [expected, actual] = await Promise.all([
      this.prisma.$queryRawUnsafe<ExpectedConsumableRow[]>(
        `SELECT p.id AS "productId", p.name AS "productName", p.sku,
                p.unit::text AS unit, ism.quantity::text AS "expectedQuantity"
         FROM inventory_service_materials ism
         JOIN inventory_products p ON p.id = ism.product_id
         WHERE ism.service_id = $1
           AND p.tenant_id = $2 AND p.company_id = $3
         ORDER BY p.name ASC, p.id ASC`,
        execution.serviceId,
        tenantId,
        companyId,
      ),
      this.prisma.$queryRawUnsafe<ActualConsumableRow[]>(
        `SELECT m.id AS "movementId", m.product_id AS "productId",
                p.name AS "productName", p.sku, p.unit::text AS unit,
                m.quantity::text AS "actualQuantity", m.warehouse_id AS "warehouseId",
                m.created_at AS "consumedAt"
         FROM inventory_movements m
         JOIN inventory_products p ON p.id = m.product_id
         JOIN inventory_warehouses w ON w.id = m.warehouse_id
         WHERE m.tenant_id = $1 AND m.company_id = $2
           AND w.branch_id = $3
           AND m.type = 'SERVICE_CONSUMPTION'
           AND m.reference_type = 'APPOINTMENT'
           AND m.reference_id = $4
         ORDER BY m.created_at ASC, m.id ASC`,
        tenantId,
        companyId,
        branchId,
        execution.appointmentId,
      ),
    ]);

    const actualByProduct = new Map<string, number>();
    for (const row of actual) {
      actualByProduct.set(
        row.productId,
        (actualByProduct.get(row.productId) ?? 0) + Number(row.actualQuantity),
      );
    }

    const lines = expected.map((row) => {
      const expectedQuantity = Number(row.expectedQuantity);
      const actualQuantity = actualByProduct.get(row.productId) ?? 0;
      return {
        productId: row.productId,
        productName: row.productName,
        sku: row.sku,
        unit: row.unit,
        expectedQuantity,
        actualQuantity,
        varianceQuantity: actualQuantity - expectedQuantity,
        posted: actualQuantity > 0,
      };
    });

    const expectedProductIds = new Set(expected.map((row) => row.productId));
    for (const row of actual) {
      if (expectedProductIds.has(row.productId)) continue;
      const actualQuantity = actualByProduct.get(row.productId) ?? 0;
      lines.push({
        productId: row.productId,
        productName: row.productName,
        sku: row.sku,
        unit: row.unit,
        expectedQuantity: 0,
        actualQuantity,
        varianceQuantity: actualQuantity,
        posted: true,
      });
      expectedProductIds.add(row.productId);
    }

    return {
      executionId: execution.id,
      executionStatus: execution.status,
      appointmentId: execution.appointmentId,
      postingStatus:
        expected.length === 0
          ? 'NOT_REQUIRED'
          : lines.every((line) => line.posted)
            ? 'POSTED'
            : 'PENDING',
      expectedLineCount: expected.length,
      movementCount: actual.length,
      lines,
      movements: actual.map((row) => ({
        movementId: row.movementId,
        productId: row.productId,
        productName: row.productName,
        sku: row.sku,
        unit: row.unit,
        quantity: Number(row.actualQuantity),
        warehouseId: row.warehouseId,
        consumedAt: row.consumedAt,
      })),
    };
  }
}
