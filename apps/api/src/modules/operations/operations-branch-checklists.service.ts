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
  CompleteBranchChecklistRunInput,
  ListBranchChecklistRunsInput,
  ListBranchChecklistTemplatesInput,
  PublishBranchChecklistTemplateInput,
  StartBranchChecklistRunInput,
  UpdateBranchChecklistRunItemInput,
} from './dto/branch-checklist.dto';

type TemplateRow = {
  id: string;
  branchId: string | null;
  category: 'OPENING' | 'CLOSING';
  name: string;
  version: number;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: Date;
};

type RunRow = {
  id: string;
  category: 'OPENING' | 'CLOSING';
  templateName: string;
  templateVersion: number;
  businessDate: Date;
  status: 'OPEN' | 'COMPLETED';
  startedAt: Date;
  completedAt: Date | null;
  version: number;
};

@Injectable()
export class OperationsBranchChecklistsService {
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
      throw new InternalServerErrorException('Organization context is incomplete.');
    }
    if (!branchId) {
      throw new BadRequestException('A branch must be selected for this operation.');
    }
    return { tenantId, companyId, branchId, membershipId };
  }

  async listTemplates(input: ListBranchChecklistTemplatesInput) {
    const { tenantId, companyId, branchId } = this.context();
    return this.prisma.$queryRawUnsafe<Array<TemplateRow & { items: unknown }>>(
      `SELECT t.id, t.branch_id AS "branchId", t.category, t.name, t.version,
              t.status, t.created_at AS "createdAt",
              COALESCE(json_agg(json_build_object(
                'id', i.id, 'code', i.code, 'title', i.title,
                'sortOrder', i.sort_order, 'isRequired', i.is_required
              ) ORDER BY i.sort_order, i.id) FILTER (WHERE i.id IS NOT NULL), '[]'::json) AS items
       FROM operations_branch_checklist_templates t
       LEFT JOIN operations_branch_checklist_template_items i ON i.template_id = t.id
       WHERE t.tenant_id = $1 AND t.company_id = $2 AND t.status = 'ACTIVE'
         AND (t.branch_id = $3 OR t.branch_id IS NULL)
         AND ($4::text IS NULL OR t.category = $4)
       GROUP BY t.id
       ORDER BY CASE WHEN t.branch_id = $3 THEN 0 ELSE 1 END, t.category, t.version DESC`,
      tenantId,
      companyId,
      branchId,
      input.category ?? null,
    );
  }

  async publishTemplate(input: PublishBranchChecklistTemplateInput) {
    const { tenantId, companyId, branchId, membershipId } = this.context();
    const targetBranchId = input.branchId ?? null;
    if (targetBranchId && targetBranchId !== branchId) {
      throw new BadRequestException(
        'Branch-scoped templates can only target the active branch.',
      );
    }

    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRawUnsafe(
          `WITH _advisory_lock AS (SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))) SELECT 1 FROM _advisory_lock`,
          `${tenantId}:${companyId}`,
          `branch-checklist-template:${targetBranchId ?? 'company'}:${input.category}`,
        );

        const active = await tx.$queryRawUnsafe<TemplateRow[]>(
          `SELECT id, branch_id AS "branchId", category, name, version, status,
                  created_at AS "createdAt"
           FROM operations_branch_checklist_templates
           WHERE tenant_id = $1 AND company_id = $2
             AND branch_id IS NOT DISTINCT FROM $3::text
             AND category = $4 AND status = 'ACTIVE'
           LIMIT 1`,
          tenantId,
          companyId,
          targetBranchId,
          input.category,
        );

        if (active[0]) {
          const existingItems = await tx.$queryRawUnsafe<
            Array<{ code: string; title: string; isRequired: boolean }>
          >(
            `SELECT code, title, is_required AS "isRequired"
             FROM operations_branch_checklist_template_items
             WHERE template_id = $1 ORDER BY sort_order, id`,
            active[0].id,
          );
          const unchanged =
            active[0].name === input.name &&
            existingItems.length === input.items.length &&
            existingItems.every(
              (item, index) =>
                item.code === input.items[index].code &&
                item.title === input.items[index].title &&
                item.isRequired === input.items[index].isRequired,
            );
          if (unchanged) return { template: active[0], unchanged: true };

          await tx.$executeRawUnsafe(
            `UPDATE operations_branch_checklist_templates
             SET status = 'INACTIVE', updated_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            active[0].id,
          );
        }

        const version = (active[0]?.version ?? 0) + 1;
        const created = await tx.$queryRawUnsafe<TemplateRow[]>(
          `INSERT INTO operations_branch_checklist_templates (
             tenant_id, company_id, branch_id, category, name, version,
             created_by_membership_id
           ) VALUES ($1,$2,$3,$4,$5,$6,$7)
           RETURNING id, branch_id AS "branchId", category, name, version,
                     status, created_at AS "createdAt"`,
          tenantId,
          companyId,
          targetBranchId,
          input.category,
          input.name,
          version,
          membershipId,
        );

        for (const [index, item] of input.items.entries()) {
          await tx.$executeRawUnsafe(
            `INSERT INTO operations_branch_checklist_template_items (
               template_id, code, title, sort_order, is_required
             ) VALUES ($1,$2,$3,$4,$5)`,
            created[0].id,
            item.code,
            item.title,
            index,
            item.isRequired,
          );
        }
        return { template: created[0], unchanged: false };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async startRun(input: StartBranchChecklistRunInput) {
    const { tenantId, companyId, branchId, membershipId } = this.context();
    const businessDate = input.businessDate.toISOString().slice(0, 10);

    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRawUnsafe(
          `WITH _advisory_lock AS (SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))) SELECT 1 FROM _advisory_lock`,
          `${tenantId}:${branchId}`,
          `branch-checklist-run:${input.category}:${businessDate}`,
        );

        const existing = await tx.$queryRawUnsafe<RunRow[]>(
          `SELECT id, category, template_name AS "templateName",
                  template_version AS "templateVersion", business_date AS "businessDate",
                  status, started_at AS "startedAt", completed_at AS "completedAt", version
           FROM operations_branch_checklist_runs
           WHERE tenant_id = $1 AND company_id = $2 AND branch_id = $3
             AND category = $4 AND business_date = $5::date
           LIMIT 1`,
          tenantId,
          companyId,
          branchId,
          input.category,
          businessDate,
        );
        if (existing[0]) return this.getRunWithItems(tx, existing[0].id, tenantId, companyId, branchId);

        const templates = await tx.$queryRawUnsafe<TemplateRow[]>(
          `SELECT id, branch_id AS "branchId", category, name, version, status,
                  created_at AS "createdAt"
           FROM operations_branch_checklist_templates
           WHERE tenant_id = $1 AND company_id = $2 AND category = $3
             AND status = 'ACTIVE' AND (branch_id = $4 OR branch_id IS NULL)
           ORDER BY CASE WHEN branch_id = $4 THEN 0 ELSE 1 END, version DESC
           LIMIT 1`,
          tenantId,
          companyId,
          input.category,
          branchId,
        );
        const template = templates[0];
        if (!template) {
          throw new BadRequestException(
            `No active ${input.category.toLowerCase()} checklist template is configured.`,
          );
        }

        const created = await tx.$queryRawUnsafe<RunRow[]>(
          `INSERT INTO operations_branch_checklist_runs (
             tenant_id, company_id, branch_id, template_id, template_version,
             category, template_name, business_date, started_by_membership_id
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::date,$9)
           RETURNING id, category, template_name AS "templateName",
                     template_version AS "templateVersion", business_date AS "businessDate",
                     status, started_at AS "startedAt", completed_at AS "completedAt", version`,
          tenantId,
          companyId,
          branchId,
          template.id,
          template.version,
          template.category,
          template.name,
          businessDate,
          membershipId,
        );

        await tx.$executeRawUnsafe(
          `INSERT INTO operations_branch_checklist_run_items (
             run_id, item_code, title, sort_order, is_required
           )
           SELECT $1, code, title, sort_order, is_required
           FROM operations_branch_checklist_template_items
           WHERE template_id = $2
           ORDER BY sort_order, id`,
          created[0].id,
          template.id,
        );
        await tx.$executeRawUnsafe(
          `INSERT INTO operations_branch_checklist_events (
             run_id, tenant_id, branch_id, actor_membership_id, event_type, note
           ) VALUES ($1,$2,$3,$4,'RUN_STARTED',$5)`,
          created[0].id,
          tenantId,
          branchId,
          membershipId,
          `${template.name} v${template.version}`,
        );
        return this.getRunWithItems(tx, created[0].id, tenantId, companyId, branchId);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async listRuns(input: ListBranchChecklistRunsInput) {
    const { tenantId, companyId, branchId } = this.context();
    return this.prisma.$queryRawUnsafe<RunRow[]>(
      `SELECT id, category, template_name AS "templateName",
              template_version AS "templateVersion", business_date AS "businessDate",
              status, started_at AS "startedAt", completed_at AS "completedAt", version
       FROM operations_branch_checklist_runs
       WHERE tenant_id = $1 AND company_id = $2 AND branch_id = $3
         AND ($4::text IS NULL OR category = $4)
         AND ($5::date IS NULL OR business_date >= $5::date)
         AND ($6::date IS NULL OR business_date <= $6::date)
       ORDER BY business_date DESC, category ASC`,
      tenantId,
      companyId,
      branchId,
      input.category ?? null,
      input.from ? input.from.toISOString().slice(0, 10) : null,
      input.to ? input.to.toISOString().slice(0, 10) : null,
    );
  }

  async getRun(runId: string) {
    const { tenantId, companyId, branchId } = this.context();
    return this.getRunWithItems(this.prisma, runId, tenantId, companyId, branchId);
  }

  async updateItem(
    runId: string,
    itemId: string,
    input: UpdateBranchChecklistRunItemInput,
  ) {
    const { tenantId, companyId, branchId, membershipId } = this.context();
    return this.prisma.$transaction(
      async (tx) => {
        const run = await this.requireOpenRun(tx, runId, tenantId, companyId, branchId);
        const current = await tx.$queryRawUnsafe<
          Array<{ id: string; itemCode: string; isRequired: boolean; version: number }>
        >(
          `SELECT id, item_code AS "itemCode", is_required AS "isRequired", version
           FROM operations_branch_checklist_run_items
           WHERE id = $1 AND run_id = $2 LIMIT 1`,
          itemId,
          runId,
        );
        if (!current[0]) throw new NotFoundException('Checklist item not found');
        if (current[0].version !== input.expectedVersion) {
          throw new ConflictException('Checklist item changed since it was read. Refresh and retry.');
        }
        if (current[0].isRequired && input.status === 'NA') {
          throw new BadRequestException('Required checklist items cannot be marked as not applicable.');
        }
        const updated = await tx.$queryRawUnsafe<
          Array<{ id: string; status: string; note: string | null; version: number }>
        >(
          `UPDATE operations_branch_checklist_run_items
           SET status = $3, note = $4, completed_by_membership_id = $5,
               completed_at = CURRENT_TIMESTAMP, version = version + 1,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1 AND run_id = $2 AND version = $6
           RETURNING id, status, note, version`,
          itemId,
          runId,
          input.status,
          input.note ?? null,
          membershipId,
          input.expectedVersion,
        );
        if (!updated[0]) throw new ConflictException('Checklist item changed during update.');
        await tx.$executeRawUnsafe(
          `INSERT INTO operations_branch_checklist_events (
             run_id, tenant_id, branch_id, actor_membership_id, event_type, note
           ) VALUES ($1,$2,$3,$4,$5,$6)`,
          run.id,
          tenantId,
          branchId,
          membershipId,
          input.status === 'COMPLETED' ? 'ITEM_COMPLETED' : 'ITEM_NA',
          `${current[0].itemCode}${input.note ? `: ${input.note}` : ''}`,
        );
        return updated[0];
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async completeRun(runId: string, input: CompleteBranchChecklistRunInput) {
    const { tenantId, companyId, branchId, membershipId } = this.context();
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRawUnsafe(
          `WITH _advisory_lock AS (SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))) SELECT 1 FROM _advisory_lock`,
          `${tenantId}:${branchId}`,
          `branch-checklist-run:${runId}`,
        );
        const run = await this.requireOpenRun(tx, runId, tenantId, companyId, branchId);
        if (run.version !== input.expectedVersion) {
          throw new ConflictException('Checklist run changed since it was read. Refresh and retry.');
        }
        const blockers = await tx.$queryRawUnsafe<Array<{ count: number }>>(
          `SELECT COUNT(*)::int AS count
           FROM operations_branch_checklist_run_items
           WHERE run_id = $1 AND is_required = TRUE AND status <> 'COMPLETED'`,
          runId,
        );
        if ((blockers[0]?.count ?? 0) > 0) {
          throw new BadRequestException('Complete all required checklist items first.');
        }
        const rows = await tx.$queryRawUnsafe<RunRow[]>(
          `UPDATE operations_branch_checklist_runs
           SET status = 'COMPLETED', completed_by_membership_id = $5,
               completed_at = CURRENT_TIMESTAMP, version = version + 1,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1 AND tenant_id = $2 AND company_id = $3 AND branch_id = $4
             AND status = 'OPEN' AND version = $6
           RETURNING id, category, template_name AS "templateName",
                     template_version AS "templateVersion", business_date AS "businessDate",
                     status, started_at AS "startedAt", completed_at AS "completedAt", version`,
          runId,
          tenantId,
          companyId,
          branchId,
          membershipId,
          input.expectedVersion,
        );
        if (!rows[0]) throw new ConflictException('Checklist run changed during completion.');
        await tx.$executeRawUnsafe(
          `INSERT INTO operations_branch_checklist_events (
             run_id, tenant_id, branch_id, actor_membership_id, event_type, note
           ) VALUES ($1,$2,$3,$4,'RUN_COMPLETED',NULL)`,
          runId,
          tenantId,
          branchId,
          membershipId,
        );
        return rows[0];
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async requireOpenRun(
    db: Prisma.TransactionClient,
    runId: string,
    tenantId: string,
    companyId: string,
    branchId: string,
  ) {
    const rows = await db.$queryRawUnsafe<RunRow[]>(
      `SELECT id, category, template_name AS "templateName",
              template_version AS "templateVersion", business_date AS "businessDate",
              status, started_at AS "startedAt", completed_at AS "completedAt", version
       FROM operations_branch_checklist_runs
       WHERE id = $1 AND tenant_id = $2 AND company_id = $3 AND branch_id = $4
       LIMIT 1`,
      runId,
      tenantId,
      companyId,
      branchId,
    );
    if (!rows[0]) throw new NotFoundException('Checklist run not found');
    if (rows[0].status !== 'OPEN') throw new ConflictException('Checklist run is already completed.');
    return rows[0];
  }

  private async getRunWithItems(
    db: Pick<PrismaService, '$queryRawUnsafe'> | Prisma.TransactionClient,
    runId: string,
    tenantId: string,
    companyId: string,
    branchId: string,
  ) {
    const rows = await db.$queryRawUnsafe<RunRow[]>(
      `SELECT id, category, template_name AS "templateName",
              template_version AS "templateVersion", business_date AS "businessDate",
              status, started_at AS "startedAt", completed_at AS "completedAt", version
       FROM operations_branch_checklist_runs
       WHERE id = $1 AND tenant_id = $2 AND company_id = $3 AND branch_id = $4
       LIMIT 1`,
      runId,
      tenantId,
      companyId,
      branchId,
    );
    if (!rows[0]) throw new NotFoundException('Checklist run not found');
    const items = await db.$queryRawUnsafe<
      Array<{
        id: string;
        itemCode: string;
        title: string;
        sortOrder: number;
        isRequired: boolean;
        status: 'PENDING' | 'COMPLETED' | 'NA';
        note: string | null;
        completedAt: Date | null;
        version: number;
      }>
    >(
      `SELECT id, item_code AS "itemCode", title, sort_order AS "sortOrder",
              is_required AS "isRequired", status, note,
              completed_at AS "completedAt", version
       FROM operations_branch_checklist_run_items
       WHERE run_id = $1 ORDER BY sort_order, id`,
      runId,
    );
    return { ...rows[0], items };
  }
}
