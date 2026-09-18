import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';

import { Prisma, PrismaService } from '@beauty-erp/database';

import { TenantContext } from '../../common/tenant/tenant-context';

type ExecutionContextRow = {
  id: string;
  appointmentId: string;
  serviceId: string;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
};

type ExpectedConsumableRow = {
  productId: string;
  productName: string;
  sku: string | null;
  unit: string;
  expectedQuantity: string;
  recordedActualQuantity: string | null;
  version: number;
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

export type RecordActualConsumableInput = {
  actualQuantity: number;
  expectedVersion: number;
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
    const membershipId = this.tenantContext.getMembershipId();

    if (!tenantId || !companyId || !membershipId) {
      throw new InternalServerErrorException(
        'Organization context is incomplete.',
      );
    }
    if (!branchId) {
      throw new BadRequestException(
        'A branch must be selected for this operation.',
      );
    }

    return { tenantId, companyId, branchId, membershipId };
  }

  async executionSummary(executionId: string) {
    const { tenantId, companyId, branchId } = this.context();
    const execution = await this.findExecution(
      this.prisma,
      executionId,
      tenantId,
      companyId,
      branchId,
    );

    const [expected, actual] = await Promise.all([
      this.prisma.$queryRawUnsafe<ExpectedConsumableRow[]>(
        `SELECT c.product_id AS "productId", p.name AS "productName", p.sku,
                p.unit::text AS unit,
                c.expected_quantity::text AS "expectedQuantity",
                c.actual_quantity::text AS "recordedActualQuantity",
                c.version
         FROM operations_service_execution_consumables c
         JOIN inventory_products p ON p.id = c.product_id
         WHERE c.execution_id = $1 AND c.tenant_id = $2 AND c.branch_id = $3
           AND p.tenant_id = $2 AND p.company_id = $4
         ORDER BY p.name ASC, p.id ASC`,
        execution.id,
        tenantId,
        branchId,
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
           AND (
             (m.reference_type = 'SERVICE_EXECUTION' AND m.reference_id = $4)
             OR
             (m.reference_type = 'APPOINTMENT' AND m.reference_id = $5)
           )
         ORDER BY m.created_at ASC, m.id ASC`,
        tenantId,
        companyId,
        branchId,
        execution.id,
        execution.appointmentId,
      ),
    ]);

    const postedByProduct = new Map<string, number>();
    for (const row of actual) {
      postedByProduct.set(
        row.productId,
        (postedByProduct.get(row.productId) ?? 0) + Number(row.actualQuantity),
      );
    }

    const lines = expected.map((row) => {
      const expectedQuantity = Number(row.expectedQuantity);
      const recordedActualQuantity =
        row.recordedActualQuantity == null
          ? null
          : Number(row.recordedActualQuantity);
      const plannedActualQuantity = recordedActualQuantity ?? expectedQuantity;
      const postedQuantity = postedByProduct.get(row.productId) ?? 0;
      return {
        productId: row.productId,
        productName: row.productName,
        sku: row.sku,
        unit: row.unit,
        expectedQuantity,
        recordedActualQuantity,
        plannedActualQuantity,
        postedQuantity,
        varianceQuantity: plannedActualQuantity - expectedQuantity,
        posted: postedQuantity === plannedActualQuantity,
        version: row.version,
      };
    });

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

  async recordActual(
    executionId: string,
    productId: string,
    input: RecordActualConsumableInput,
  ) {
    if (!Number.isFinite(input.actualQuantity) || input.actualQuantity < 0) {
      throw new BadRequestException('Actual quantity must be zero or greater.');
    }
    if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 0) {
      throw new BadRequestException('Expected version must be zero or greater.');
    }

    const { tenantId, companyId, branchId, membershipId } = this.context();

    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRawUnsafe(
          `SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))`,
          `${tenantId}:${branchId}`,
          `execution-consumable:${executionId}:${productId}`,
        );

        const execution = await this.findExecution(
          tx,
          executionId,
          tenantId,
          companyId,
          branchId,
        );
        if (execution.status === 'CANCELLED') {
          throw new ConflictException(
            'Consumables cannot be changed for a cancelled service execution.',
          );
        }

        const posted = await tx.$queryRawUnsafe<Array<{ id: string }>>(
          `SELECT m.id
           FROM inventory_movements m
           JOIN inventory_warehouses w ON w.id = m.warehouse_id
           WHERE m.tenant_id = $1 AND m.company_id = $2 AND w.branch_id = $3
             AND m.type = 'SERVICE_CONSUMPTION'
             AND (
               (m.reference_type = 'SERVICE_EXECUTION' AND m.reference_id = $4)
               OR
               (m.reference_type = 'APPOINTMENT' AND m.reference_id = $5)
             )
           LIMIT 1`,
          tenantId,
          companyId,
          branchId,
          execution.id,
          execution.appointmentId,
        );
        if (posted[0]) {
          throw new ConflictException(
            'Consumables are locked because inventory posting already exists.',
          );
        }

        const existing = await tx.$queryRawUnsafe<
          Array<{
            expectedQuantity: string;
            actualQuantity: string | null;
            version: number;
          }>
        >(
          `SELECT expected_quantity::text AS "expectedQuantity",
                  actual_quantity::text AS "actualQuantity", version
           FROM operations_service_execution_consumables
           WHERE execution_id = $1 AND product_id = $2
             AND tenant_id = $3 AND branch_id = $4
           LIMIT 1`,
          execution.id,
          productId,
          tenantId,
          branchId,
        );

        if (!existing[0]) {
          if (input.expectedVersion !== 0) {
            throw new ConflictException(
              'Consumable line does not exist at the expected version.',
            );
          }

          const products = await tx.$queryRawUnsafe<Array<{ id: string }>>(
            `SELECT id FROM inventory_products
             WHERE id = $1 AND tenant_id = $2 AND company_id = $3
               AND status = 'ACTIVE'
             LIMIT 1`,
            productId,
            tenantId,
            companyId,
          );
          if (!products[0]) {
            throw new NotFoundException('Inventory product not found');
          }

          const inserted = await tx.$queryRawUnsafe<
            Array<{
              productId: string;
              expectedQuantity: string;
              actualQuantity: string;
              version: number;
            }>
          >(
            `INSERT INTO operations_service_execution_consumables (
               execution_id, tenant_id, branch_id, product_id,
               expected_quantity, actual_quantity
             ) VALUES ($1,$2,$3,$4,0,$5)
             RETURNING product_id AS "productId",
                       expected_quantity::text AS "expectedQuantity",
                       actual_quantity::text AS "actualQuantity", version`,
            execution.id,
            tenantId,
            branchId,
            productId,
            input.actualQuantity,
          );

          await this.writeConsumableEvent(
            tx,
            execution,
            tenantId,
            branchId,
            membershipId,
            productId,
            input.actualQuantity,
          );
          return inserted[0];
        }

        if (existing[0].version !== input.expectedVersion) {
          throw new ConflictException(
            'Consumable line changed since it was read. Refresh and retry.',
          );
        }

        const updated = await tx.$queryRawUnsafe<
          Array<{
            productId: string;
            expectedQuantity: string;
            actualQuantity: string;
            version: number;
          }>
        >(
          `UPDATE operations_service_execution_consumables
           SET actual_quantity = $5, version = version + 1,
               updated_at = CURRENT_TIMESTAMP
           WHERE execution_id = $1 AND product_id = $2
             AND tenant_id = $3 AND branch_id = $4 AND version = $6
           RETURNING product_id AS "productId",
                     expected_quantity::text AS "expectedQuantity",
                     actual_quantity::text AS "actualQuantity", version`,
          execution.id,
          productId,
          tenantId,
          branchId,
          input.actualQuantity,
          input.expectedVersion,
        );
        if (!updated[0]) {
          throw new ConflictException(
            'Consumable line changed during update. Refresh and retry.',
          );
        }

        await this.writeConsumableEvent(
          tx,
          execution,
          tenantId,
          branchId,
          membershipId,
          productId,
          input.actualQuantity,
        );
        return updated[0];
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async findExecution(
    db: Pick<PrismaService, '$queryRawUnsafe'> | Prisma.TransactionClient,
    executionId: string,
    tenantId: string,
    companyId: string,
    branchId: string,
  ) {
    const executions = await db.$queryRawUnsafe<ExecutionContextRow[]>(
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
    if (!executions[0]) throw new NotFoundException('Service execution not found');
    return executions[0];
  }

  private async writeConsumableEvent(
    tx: Prisma.TransactionClient,
    execution: ExecutionContextRow,
    tenantId: string,
    branchId: string,
    membershipId: string,
    productId: string,
    actualQuantity: number,
  ) {
    await tx.$executeRawUnsafe(
      `INSERT INTO operations_service_execution_events (
         execution_id, tenant_id, branch_id, actor_membership_id,
         event_type, from_status, to_status, note
       ) VALUES ($1,$2,$3,$4,'CONSUMABLE_ACTUAL_RECORDED',$5,$5,$6)`,
      execution.id,
      tenantId,
      branchId,
      membershipId,
      execution.status,
      `Product ${productId} actual quantity recorded as ${actualQuantity}.`,
    );
  }
}
