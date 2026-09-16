import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

type ExecutionRow = {
  id: string;
  visitId: string;
  appointmentId: string | null;
  walkInCommercialContextId: string | null;
  saleItemId: string | null;
  serviceId: string;
  staffId: string;
  roomId: string | null;
  assetId: string | null;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  startedAt: Date;
  completedAt: Date | null;
  note: string | null;
  completionNote: string | null;
  version: number;
};

@Injectable()
export class ServiceExecutionReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  private context() {
    const tenantId = this.tenantContext.getTenantId();
    const companyId = this.tenantContext.getCompanyId();
    const branchId = this.tenantContext.getBranchId();
    if (!tenantId || !companyId) {
      throw new InternalServerErrorException('Organization context is incomplete.');
    }
    if (!branchId) {
      throw new BadRequestException('A branch must be selected for this operation.');
    }
    return { tenantId, companyId, branchId };
  }

  async assertAppointmentBacked(executionId: string) {
    const { tenantId, companyId, branchId } = this.context();
    const rows = await this.prisma.$queryRawUnsafe<Array<{ appointmentId: string | null }>>(
      `SELECT appointment_id AS "appointmentId"
       FROM operations_service_executions
       WHERE id=$1 AND tenant_id=$2 AND company_id=$3 AND branch_id=$4
       LIMIT 1`,
      executionId,
      tenantId,
      companyId,
      branchId,
    );
    if (!rows[0]) throw new NotFoundException('Service execution not found.');
    if (!rows[0].appointmentId) {
      throw new BadRequestException(
        'Walk-in service executions do not have an appointment completion handoff.',
      );
    }
    return rows[0].appointmentId;
  }

  async listByVisit(visitId: string) {
    const { tenantId, companyId, branchId } = this.context();
    const executions = await this.prisma.$queryRawUnsafe<ExecutionRow[]>(
      `SELECT e.id, e.visit_id AS "visitId", e.appointment_id AS "appointmentId",
              e.walk_in_commercial_context_id AS "walkInCommercialContextId",
              e.sale_item_id AS "saleItemId", e.service_id AS "serviceId",
              e.staff_id AS "staffId", e.room_id AS "roomId",
              e.inventory_asset_id AS "assetId", e.status,
              e.started_at AS "startedAt", e.completed_at AS "completedAt",
              e.note, e.completion_note AS "completionNote", e.version
       FROM operations_service_executions e
       WHERE e.visit_id=$1 AND e.tenant_id=$2 AND e.company_id=$3 AND e.branch_id=$4
       ORDER BY e.started_at ASC,e.id ASC`,
      visitId,
      tenantId,
      companyId,
      branchId,
    );
    if (!executions.length) return [];

    const appointmentIds = executions
      .map((execution) => execution.appointmentId)
      .filter((id): id is string => Boolean(id));

    const appointments = appointmentIds.length
      ? await this.prisma.appointment.findMany({
          where: { id: { in: appointmentIds }, tenantId, branchId },
          select: {
            id: true,
            status: true,
            session: { select: { id: true, status: true } },
          },
        })
      : [];
    const appointmentMap = new Map(
      appointments.map((appointment) => [appointment.id, appointment]),
    );

    const walkInRows = await this.prisma.$queryRawUnsafe<Array<{
      contextId: string;
      saleId: string;
      saleStatus: string;
      saleItemId: string;
      description: string;
    }>>(
      `SELECT wc.id AS "contextId", wc.sale_id AS "saleId", s.status::text AS "saleStatus",
              si.id AS "saleItemId", si.description
       FROM operations_walk_in_commercial_contexts wc
       JOIN sales s ON s.id=wc.sale_id
       JOIN sale_items si ON si."saleId"=s.id
       WHERE wc.visit_id=$1 AND wc.tenant_id=$2 AND wc.company_id=$3 AND wc.branch_id=$4`,
      visitId,
      tenantId,
      companyId,
      branchId,
    );
    const walkInMap = new Map(
      walkInRows.map((row) => [`${row.contextId}:${row.saleItemId}`, row]),
    );

    return executions.map((execution) => {
      const appointment = execution.appointmentId
        ? appointmentMap.get(execution.appointmentId)
        : undefined;
      const walkIn =
        execution.walkInCommercialContextId && execution.saleItemId
          ? walkInMap.get(`${execution.walkInCommercialContextId}:${execution.saleItemId}`)
          : undefined;
      return {
        ...execution,
        source: execution.appointmentId ? ('APPOINTMENT' as const) : ('WALK_IN' as const),
        appointmentStatus: appointment?.status ?? null,
        packageSessionId: appointment?.session?.id ?? null,
        packageSessionStatus: appointment?.session?.status ?? null,
        walkInSaleId: walkIn?.saleId ?? null,
        walkInSaleStatus: walkIn?.saleStatus ?? null,
        walkInServiceDescription: walkIn?.description ?? null,
      };
    });
  }
}
