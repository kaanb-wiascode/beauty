import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { randomUUID } from 'node:crypto';

import { TenantContext } from '../../common/tenant/tenant-context';
import { PlatformAuditService } from '../platform-audit/platform-audit.service';

type WorkflowRow = {
  id: string;
  tenantId: string;
  companyId: string;
  workflowKey: string;
  name: string;
  domain: string;
  description: string | null;
  version: number;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  conditions: unknown;
  steps: unknown;
  createdByUserId: string;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class ApprovalWorkflowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
    private readonly audit: PlatformAuditService,
  ) {}

  async list(domain?: string) {
    const context = this.tenantContext.getContext();
    return this.prisma.$queryRaw<WorkflowRow[]>`
      SELECT *
      FROM approval_workflow_definitions
      WHERE "tenantId" = ${context.tenantId}
        AND "companyId" = ${context.companyId}
        AND (${domain ?? null}::text IS NULL OR domain = ${domain ?? null})
      ORDER BY "workflowKey", version DESC
      LIMIT 500
    `;
  }

  async create(input: {
    workflowKey: string;
    name: string;
    domain: string;
    description?: string;
    conditions: Record<string, unknown>;
    steps: Array<Record<string, unknown>>;
  }) {
    const context = this.tenantContext.getContext();
    const actorUserId = await this.actorUserId();
    const workflowKey = this.normalizeKey(input.workflowKey);
    const name = input.name.trim();
    const domain = this.normalizeKey(input.domain);
    if (!workflowKey || !domain || !name) {
      throw new BadRequestException('Workflow key, name and domain are required');
    }
    if (input.steps.length === 0) {
      throw new BadRequestException('Approval workflow requires at least one step');
    }

    return this.prisma.$transaction(
      async (tx) => {
        const versions = await tx.$queryRaw<Array<{ version: number }>>`
          SELECT version
          FROM approval_workflow_definitions
          WHERE "tenantId" = ${context.tenantId}
            AND "companyId" = ${context.companyId}
            AND "workflowKey" = ${workflowKey}
          ORDER BY version DESC
          LIMIT 1
          FOR UPDATE
        `;
        const version = (versions[0]?.version ?? 0) + 1;
        const id = randomUUID();
        const rows = await tx.$queryRaw<WorkflowRow[]>`
          INSERT INTO approval_workflow_definitions (
            id, "tenantId", "companyId", "workflowKey", name, domain, description,
            version, status, conditions, steps, "createdByUserId", "createdAt", "updatedAt"
          ) VALUES (
            ${id}, ${context.tenantId}, ${context.companyId}, ${workflowKey}, ${name}, ${domain},
            ${input.description?.trim() || null}, ${version}, 'DRAFT',
            ${JSON.stringify(input.conditions)}::jsonb, ${JSON.stringify(input.steps)}::jsonb,
            ${actorUserId}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
          )
          RETURNING *
        `;
        const created = rows[0];
        await this.audit.record({
          actorUserId,
          resource: 'approval_workflows',
          action: 'create',
          targetTenantId: context.tenantId,
          targetEntityType: 'approval_workflow_definition',
          targetEntityId: created.id,
          beforeState: null,
          afterState: {
            workflowKey: created.workflowKey,
            domain: created.domain,
            version: created.version,
            status: created.status,
            steps: created.steps,
            conditions: created.conditions,
          },
          metadata: { companyId: context.companyId, actorMembershipId: context.membershipId },
        }, tx);
        return created;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async updateDraft(id: string, input: {
    name?: string;
    description?: string | null;
    conditions?: Record<string, unknown>;
    steps?: Array<Record<string, unknown>>;
  }) {
    const context = this.tenantContext.getContext();
    const actorUserId = await this.actorUserId();
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<WorkflowRow[]>`
        SELECT * FROM approval_workflow_definitions
        WHERE id = ${id}
          AND "tenantId" = ${context.tenantId}
          AND "companyId" = ${context.companyId}
        FOR UPDATE
      `;
      const current = rows[0];
      if (!current) throw new NotFoundException('Approval workflow not found');
      if (current.status !== 'DRAFT') {
        throw new BadRequestException('Published or archived workflows are immutable; create a new version');
      }
      if (input.steps && input.steps.length === 0) {
        throw new BadRequestException('Approval workflow requires at least one step');
      }
      const nextName = input.name?.trim() || current.name;
      const nextDescription = input.description === undefined ? current.description : input.description?.trim() || null;
      const nextConditions = input.conditions === undefined ? current.conditions : input.conditions;
      const nextSteps = input.steps === undefined ? current.steps : input.steps;
      const updatedRows = await tx.$queryRaw<WorkflowRow[]>`
        UPDATE approval_workflow_definitions
        SET name = ${nextName},
            description = ${nextDescription},
            conditions = ${JSON.stringify(nextConditions)}::jsonb,
            steps = ${JSON.stringify(nextSteps)}::jsonb,
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE id = ${current.id}
        RETURNING *
      `;
      const updated = updatedRows[0];
      await this.audit.record({
        actorUserId,
        resource: 'approval_workflows',
        action: 'draft.update',
        targetTenantId: context.tenantId,
        targetEntityType: 'approval_workflow_definition',
        targetEntityId: current.id,
        beforeState: { name: current.name, description: current.description, conditions: current.conditions, steps: current.steps },
        afterState: { name: updated.name, description: updated.description, conditions: updated.conditions, steps: updated.steps },
        metadata: { companyId: context.companyId, version: current.version },
      }, tx);
      return updated;
    });
  }

  async publish(id: string) {
    const context = this.tenantContext.getContext();
    const actorUserId = await this.actorUserId();
    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<WorkflowRow[]>`
          SELECT * FROM approval_workflow_definitions
          WHERE id = ${id}
            AND "tenantId" = ${context.tenantId}
            AND "companyId" = ${context.companyId}
          FOR UPDATE
        `;
        const current = rows[0];
        if (!current) throw new NotFoundException('Approval workflow not found');
        if (current.status !== 'DRAFT') {
          throw new BadRequestException('Only draft workflows can be published');
        }
        const steps = Array.isArray(current.steps) ? current.steps : [];
        if (steps.length === 0) throw new BadRequestException('Approval workflow requires at least one step');

        await tx.$executeRaw`
          UPDATE approval_workflow_definitions
          SET status = 'ARCHIVED', "updatedAt" = CURRENT_TIMESTAMP
          WHERE "tenantId" = ${context.tenantId}
            AND "companyId" = ${context.companyId}
            AND "workflowKey" = ${current.workflowKey}
            AND status = 'PUBLISHED'
        `;
        const publishedRows = await tx.$queryRaw<WorkflowRow[]>`
          UPDATE approval_workflow_definitions
          SET status = 'PUBLISHED', "publishedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
          WHERE id = ${current.id}
          RETURNING *
        `;
        const published = publishedRows[0];
        await this.audit.record({
          actorUserId,
          resource: 'approval_workflows',
          action: 'publish',
          targetTenantId: context.tenantId,
          targetEntityType: 'approval_workflow_definition',
          targetEntityId: current.id,
          beforeState: { status: current.status },
          afterState: { status: published.status, publishedAt: published.publishedAt },
          metadata: {
            companyId: context.companyId,
            workflowKey: current.workflowKey,
            version: current.version,
          },
        }, tx);
        return published;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async actorUserId() {
    const context = this.tenantContext.getContext();
    const actor = await this.prisma.membership.findFirst({
      where: {
        id: context.membershipId,
        tenantId: context.tenantId,
        companyId: context.companyId,
        status: 'ACTIVE',
      },
      select: { userId: true },
    });
    if (!actor) throw new BadRequestException('Active administrator membership is required');
    return actor.userId;
  }

  private normalizeKey(value: string) {
    return value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  }
}
