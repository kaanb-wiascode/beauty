import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';

import { Prisma, PrismaService } from '@beauty-erp/database';

import { TenantContext } from '../../common/tenant/tenant-context';
import type {
  CreateServiceChecklistTemplateInput,
  UpdateExecutionChecklistItemInput,
} from './dto/service-checklist.dto';

type TemplateRow = {
  id: string;
  serviceId: string;
  name: string;
  version: number;
  isActive: boolean;
  createdAt: Date;
};

type TemplateItemRow = {
  id: string;
  code: string;
  title: string;
  description: string | null;
  sortOrder: number;
  isRequired: boolean;
};

type ExecutionChecklistRow = {
  id: string;
  executionId: string;
  templateId: string;
  templateVersion: number;
  itemCode: string;
  title: string;
  description: string | null;
  sortOrder: number;
  isRequired: boolean;
  status: 'PENDING' | 'COMPLETED' | 'NA';
  note: string | null;
  completedByMembershipId: string | null;
  completedAt: Date | null;
  version: number;
};

@Injectable()
export class OperationsServiceChecklistsService {
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

  async getActiveTemplate(serviceId: string) {
    const { tenantId, companyId, branchId } = this.context();
    await this.requireService(
      this.prisma,
      serviceId,
      tenantId,
      branchId,
    );

    const templates = await this.prisma.$queryRawUnsafe<TemplateRow[]>(
      `SELECT id, service_id AS "serviceId", name, version,
              is_active AS "isActive", created_at AS "createdAt"
       FROM operations_service_checklist_templates
       WHERE service_id = $1 AND tenant_id = $2 AND company_id = $3
         AND branch_id = $4 AND is_active = TRUE
       LIMIT 1`,
      serviceId,
      tenantId,
      companyId,
      branchId,
    );
    if (!templates[0]) return null;

    return {
      ...templates[0],
      items: await this.templateItems(this.prisma, templates[0].id),
    };
  }

  async createVersion(
    serviceId: string,
    input: CreateServiceChecklistTemplateInput,
  ) {
    const { tenantId, companyId, branchId, membershipId } = this.context();

    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRawUnsafe(
          `SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))`,
          `${tenantId}:${branchId}`,
          `service-checklist:${serviceId}`,
        );

        await this.requireService(
          tx,
          serviceId,
          tenantId,
          branchId,
        );

        const active = await tx.$queryRawUnsafe<TemplateRow[]>(
          `SELECT id, service_id AS "serviceId", name, version,
                  is_active AS "isActive", created_at AS "createdAt"
           FROM operations_service_checklist_templates
           WHERE service_id = $1 AND tenant_id = $2 AND company_id = $3
             AND branch_id = $4 AND is_active = TRUE
           LIMIT 1`,
          serviceId,
          tenantId,
          companyId,
          branchId,
        );

        if (active[0]) {
          const activeItems = await this.templateItems(tx, active[0].id);
          const sameDefinition =
            active[0].name === input.name &&
            activeItems.length === input.items.length &&
            activeItems.every((item, index) => {
              const requested = input.items[index];
              return (
                item.code === requested.code &&
                item.title === requested.title &&
                (item.description ?? null) === (requested.description ?? null) &&
                item.isRequired === requested.isRequired &&
                item.sortOrder === index
              );
            });

          if (sameDefinition) {
            return { ...active[0], items: activeItems, duplicate: true };
          }
        }

        const versionRows = await tx.$queryRawUnsafe<Array<{ version: number }>>(
          `SELECT COALESCE(MAX(version), 0)::int + 1 AS version
           FROM operations_service_checklist_templates
           WHERE service_id = $1 AND tenant_id = $2 AND company_id = $3
             AND branch_id = $4`,
          serviceId,
          tenantId,
          companyId,
          branchId,
        );
        const nextVersion = versionRows[0]?.version ?? 1;

        await tx.$executeRawUnsafe(
          `UPDATE operations_service_checklist_templates
           SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP
           WHERE service_id = $1 AND tenant_id = $2 AND company_id = $3
             AND branch_id = $4 AND is_active = TRUE`,
          serviceId,
          tenantId,
          companyId,
          branchId,
        );

        const created = await tx.$queryRawUnsafe<TemplateRow[]>(
          `INSERT INTO operations_service_checklist_templates (
             tenant_id, company_id, branch_id, service_id,
             name, version, created_by_membership_id
           ) VALUES ($1,$2,$3,$4,$5,$6,$7)
           RETURNING id, service_id AS "serviceId", name, version,
                     is_active AS "isActive", created_at AS "createdAt"`,
          tenantId,
          companyId,
          branchId,
          serviceId,
          input.name,
          nextVersion,
          membershipId,
        );

        for (let index = 0; index < input.items.length; index += 1) {
          const item = input.items[index];
          await tx.$executeRawUnsafe(
            `INSERT INTO operations_service_checklist_template_items (
               template_id, code, title, description, sort_order, is_required
             ) VALUES ($1,$2,$3,$4,$5,$6)`,
            created[0].id,
            item.code,
            item.title,
            item.description ?? null,
            index,
            item.isRequired,
          );
        }

        return {
          ...created[0],
          items: await this.templateItems(tx, created[0].id),
          duplicate: false,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async getExecutionChecklist(executionId: string) {
    const { tenantId, companyId, branchId } = this.context();
    const execution = await this.requireExecution(
      this.prisma,
      executionId,
      tenantId,
      companyId,
      branchId,
    );

    const items = await this.prisma.$queryRawUnsafe<ExecutionChecklistRow[]>(
      `SELECT id, execution_id AS "executionId", template_id AS "templateId",
              template_version AS "templateVersion", item_code AS "itemCode",
              title, description, sort_order AS "sortOrder",
              is_required AS "isRequired", status, note,
              completed_by_membership_id AS "completedByMembershipId",
              completed_at AS "completedAt", version
       FROM operations_service_execution_checklist_items
       WHERE execution_id = $1 AND tenant_id = $2 AND branch_id = $3
       ORDER BY sort_order ASC, id ASC`,
      execution.id,
      tenantId,
      branchId,
    );

    const requiredItems = items.filter((item) => item.isRequired);
    return {
      executionId: execution.id,
      executionStatus: execution.status,
      templateId: items[0]?.templateId ?? null,
      templateVersion: items[0]?.templateVersion ?? null,
      requiredCount: requiredItems.length,
      requiredCompletedCount: requiredItems.filter(
        (item) => item.status === 'COMPLETED',
      ).length,
      completionBlocked: requiredItems.some(
        (item) => item.status !== 'COMPLETED',
      ),
      items,
    };
  }

  async updateExecutionItem(
    executionId: string,
    itemId: string,
    input: UpdateExecutionChecklistItemInput,
  ) {
    const { tenantId, companyId, branchId, membershipId } = this.context();

    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRawUnsafe(
          `SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))`,
          `${tenantId}:${branchId}`,
          `execution-checklist:${executionId}:${itemId}`,
        );

        const execution = await this.requireExecution(
          tx,
          executionId,
          tenantId,
          companyId,
          branchId,
        );
        if (execution.status !== 'IN_PROGRESS') {
          throw new ConflictException(
            'Checklist items can only be changed while service execution is in progress.',
          );
        }

        const current = await tx.$queryRawUnsafe<ExecutionChecklistRow[]>(
          `SELECT id, execution_id AS "executionId", template_id AS "templateId",
                  template_version AS "templateVersion", item_code AS "itemCode",
                  title, description, sort_order AS "sortOrder",
                  is_required AS "isRequired", status, note,
                  completed_by_membership_id AS "completedByMembershipId",
                  completed_at AS "completedAt", version
           FROM operations_service_execution_checklist_items
           WHERE id = $1 AND execution_id = $2 AND tenant_id = $3 AND branch_id = $4
           LIMIT 1`,
          itemId,
          execution.id,
          tenantId,
          branchId,
        );
        if (!current[0]) throw new NotFoundException('Checklist item not found');
        if (current[0].version !== input.expectedVersion) {
          throw new ConflictException(
            'Checklist item changed since it was read. Refresh and retry.',
          );
        }
        if (current[0].isRequired && input.status === 'NA') {
          throw new BadRequestException(
            'Required checklist items cannot be marked as not applicable.',
          );
        }

        const rows = await tx.$queryRawUnsafe<ExecutionChecklistRow[]>(
          `UPDATE operations_service_execution_checklist_items
           SET status = $5, note = $6,
               completed_by_membership_id = $7,
               completed_at = CURRENT_TIMESTAMP,
               version = version + 1,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1 AND execution_id = $2 AND tenant_id = $3 AND branch_id = $4
             AND version = $8
           RETURNING id, execution_id AS "executionId", template_id AS "templateId",
                     template_version AS "templateVersion", item_code AS "itemCode",
                     title, description, sort_order AS "sortOrder",
                     is_required AS "isRequired", status, note,
                     completed_by_membership_id AS "completedByMembershipId",
                     completed_at AS "completedAt", version`,
          itemId,
          execution.id,
          tenantId,
          branchId,
          input.status,
          input.note ?? null,
          membershipId,
          input.expectedVersion,
        );
        if (!rows[0]) {
          throw new ConflictException(
            'Checklist item changed during update. Refresh and retry.',
          );
        }

        await tx.$executeRawUnsafe(
          `INSERT INTO operations_service_execution_events (
             execution_id, tenant_id, branch_id, actor_membership_id,
             event_type, from_status, to_status, note
           ) VALUES ($1,$2,$3,$4,$5,$6,$6,$7)`,
          execution.id,
          tenantId,
          branchId,
          membershipId,
          input.status === 'COMPLETED'
            ? 'CHECKLIST_ITEM_COMPLETED'
            : 'CHECKLIST_ITEM_NA',
          execution.status,
          `${current[0].itemCode}: ${input.note ?? input.status}`,
        );

        return rows[0];
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async templateItems(
    db: Pick<PrismaService, '$queryRawUnsafe'> | Prisma.TransactionClient,
    templateId: string,
  ) {
    return db.$queryRawUnsafe<TemplateItemRow[]>(
      `SELECT id, code, title, description, sort_order AS "sortOrder",
              is_required AS "isRequired"
       FROM operations_service_checklist_template_items
       WHERE template_id = $1
       ORDER BY sort_order ASC, id ASC`,
      templateId,
    );
  }

  private async requireService(
    db: Pick<PrismaService, 'service'> | Prisma.TransactionClient,
    serviceId: string,
    tenantId: string,
    branchId: string,
  ) {
    const service = await db.service.findFirst({
      where: { id: serviceId, tenantId, branchId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!service) throw new NotFoundException('Service not found');
    return service;
  }

  private async requireExecution(
    db: Pick<PrismaService, '$queryRawUnsafe'> | Prisma.TransactionClient,
    executionId: string,
    tenantId: string,
    companyId: string,
    branchId: string,
  ) {
    const rows = await db.$queryRawUnsafe<
      Array<{ id: string; status: 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' }>
    >(
      `SELECT id, status::text AS status
       FROM operations_service_executions
       WHERE id = $1 AND tenant_id = $2 AND company_id = $3 AND branch_id = $4
       LIMIT 1`,
      executionId,
      tenantId,
      companyId,
      branchId,
    );
    if (!rows[0]) throw new NotFoundException('Service execution not found');
    return rows[0];
  }
}
