import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { randomUUID } from 'node:crypto';

import { TenantContext } from '../../common/tenant/tenant-context';
import { PlatformAuditService } from '../platform-audit/platform-audit.service';

@Injectable()
export class AdministrationGovernanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
    private readonly audit: PlatformAuditService,
  ) {}

  async listSodPolicies() {
    const c = this.tenantContext.getContext();
    return this.prisma.$queryRaw`
      SELECT * FROM sod_policy_definitions
      WHERE "tenantId"=${c.tenantId} AND "companyId"=${c.companyId}
      ORDER BY domain
    `;
  }

  async upsertSodPolicy(input: { domain: string; requesterCannotApprove: boolean; requireDistinctApprovers: boolean; enabled: boolean }) {
    const c = this.tenantContext.getContext();
    const actor = await this.actorUserId();
    const domain = this.key(input.domain);
    if (!domain) throw new BadRequestException('Domain is required');
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.$queryRaw<any[]>`
        SELECT * FROM sod_policy_definitions
        WHERE "tenantId"=${c.tenantId} AND "companyId"=${c.companyId} AND domain=${domain}
        FOR UPDATE
      `;
      const rows = await tx.$queryRaw<any[]>`
        INSERT INTO sod_policy_definitions (
          id,"tenantId","companyId",domain,"requesterCannotApprove","requireDistinctApprovers",enabled,
          "createdByUserId","updatedByUserId","createdAt","updatedAt"
        ) VALUES (
          ${randomUUID()},${c.tenantId},${c.companyId},${domain},${input.requesterCannotApprove},${input.requireDistinctApprovers},${input.enabled},
          ${actor},${actor},CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
        )
        ON CONFLICT ("tenantId","companyId",domain)
        DO UPDATE SET "requesterCannotApprove"=EXCLUDED."requesterCannotApprove",
          "requireDistinctApprovers"=EXCLUDED."requireDistinctApprovers", enabled=EXCLUDED.enabled,
          "updatedByUserId"=${actor}, "updatedAt"=CURRENT_TIMESTAMP
        RETURNING *
      `;
      await this.audit.record({
        actorUserId: actor, resource: 'sod_policies', action: before.length ? 'update' : 'create',
        targetTenantId: c.tenantId, targetEntityType: 'sod_policy', targetEntityId: rows[0].id,
        beforeState: before[0] ?? null, afterState: rows[0], metadata: { companyId: c.companyId, domain },
      }, tx);
      return rows[0];
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async listPrivacyPolicies() {
    const c = this.tenantContext.getContext();
    return this.prisma.$queryRaw`
      SELECT * FROM privacy_policy_definitions
      WHERE "tenantId"=${c.tenantId} AND "companyId"=${c.companyId}
      ORDER BY "dataCategory"
    `;
  }

  async upsertPrivacyPolicy(input: { dataCategory: string; retentionDays?: number | null; legalBasisReference?: string | null; notes?: string | null; enabled: boolean }) {
    const c = this.tenantContext.getContext();
    const actor = await this.actorUserId();
    const category = this.key(input.dataCategory);
    if (!category) throw new BadRequestException('Data category is required');
    if (input.retentionDays != null && input.retentionDays < 1) throw new BadRequestException('Retention days must be positive');
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.$queryRaw<any[]>`
        SELECT * FROM privacy_policy_definitions
        WHERE "tenantId"=${c.tenantId} AND "companyId"=${c.companyId} AND "dataCategory"=${category}
        FOR UPDATE
      `;
      const rows = await tx.$queryRaw<any[]>`
        INSERT INTO privacy_policy_definitions (
          id,"tenantId","companyId","dataCategory","retentionDays","legalBasisReference",notes,enabled,
          "createdByUserId","updatedByUserId","createdAt","updatedAt"
        ) VALUES (
          ${randomUUID()},${c.tenantId},${c.companyId},${category},${input.retentionDays??null},${input.legalBasisReference?.trim()||null},
          ${input.notes?.trim()||null},${input.enabled},${actor},${actor},CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
        )
        ON CONFLICT ("tenantId","companyId","dataCategory")
        DO UPDATE SET "retentionDays"=EXCLUDED."retentionDays", "legalBasisReference"=EXCLUDED."legalBasisReference",
          notes=EXCLUDED.notes, enabled=EXCLUDED.enabled, "updatedByUserId"=${actor}, "updatedAt"=CURRENT_TIMESTAMP
        RETURNING *
      `;
      await this.audit.record({
        actorUserId: actor, resource: 'privacy', action: before.length ? 'policy.update' : 'policy.create',
        targetTenantId: c.tenantId, targetEntityType: 'privacy_policy', targetEntityId: rows[0].id,
        beforeState: before[0] ?? null, afterState: rows[0], metadata: { companyId: c.companyId, dataCategory: category },
      }, tx);
      return rows[0];
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async listPrivacyRequests(status?: string) {
    const c = this.tenantContext.getContext();
    return this.prisma.$queryRaw`
      SELECT * FROM privacy_requests
      WHERE "tenantId"=${c.tenantId} AND "companyId"=${c.companyId}
        AND (${status??null}::text IS NULL OR status=${status??null})
      ORDER BY "createdAt" DESC LIMIT 500
    `;
  }

  async createPrivacyRequest(input: { requestType: 'EXPORT'|'ANONYMIZATION'|'DELETION_REVIEW'; subjectType: string; subjectId: string; reason?: string }) {
    const c = this.tenantContext.getContext();
    const actor = await this.actorUserId();
    const subjectType = this.key(input.subjectType);
    if (!subjectType || !input.subjectId.trim()) throw new BadRequestException('Subject type and id are required');
    const id = randomUUID();
    const rows = await this.prisma.$queryRaw<any[]>`
      INSERT INTO privacy_requests (
        id,"tenantId","companyId","requestType","subjectType","subjectId",reason,status,"requestedByUserId","createdAt","updatedAt"
      ) VALUES (
        ${id},${c.tenantId},${c.companyId},${input.requestType},${subjectType},${input.subjectId.trim()},${input.reason?.trim()||null},'PENDING',${actor},CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
      ) RETURNING *
    `;
    await this.audit.record({
      actorUserId: actor, resource: 'privacy', action: 'request.create', targetTenantId: c.tenantId,
      targetEntityType: 'privacy_request', targetEntityId: id, beforeState: null,
      afterState: { requestType: input.requestType, subjectType, subjectId: input.subjectId.trim(), status: 'PENDING' },
      metadata: { companyId: c.companyId },
    });
    return rows[0];
  }

  async reviewPrivacyRequest(id: string, input: { status: 'IN_REVIEW'|'APPROVED'|'REJECTED'|'COMPLETED'|'CANCELLED'; resolutionNote?: string }) {
    const c = this.tenantContext.getContext();
    const actor = await this.actorUserId();
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<any[]>`
        SELECT * FROM privacy_requests
        WHERE id=${id} AND "tenantId"=${c.tenantId} AND "companyId"=${c.companyId}
        FOR UPDATE
      `;
      const current = rows[0];
      if (!current) throw new NotFoundException('Privacy request not found');
      if (['COMPLETED','REJECTED','CANCELLED'].includes(current.status)) throw new BadRequestException('Privacy request is already final');
      const completedAt = input.status === 'COMPLETED' ? new Date() : current.completedAt;
      const updated = await tx.$queryRaw<any[]>`
        UPDATE privacy_requests SET status=${input.status}, "reviewedByUserId"=${actor}, "reviewedAt"=CURRENT_TIMESTAMP,
          "completedAt"=${completedAt??null}, "resolutionNote"=${input.resolutionNote?.trim()||null}, "updatedAt"=CURRENT_TIMESTAMP
        WHERE id=${id} RETURNING *
      `;
      await this.audit.record({
        actorUserId: actor, resource: 'privacy', action: 'request.review', targetTenantId: c.tenantId,
        targetEntityType: 'privacy_request', targetEntityId: id,
        beforeState: { status: current.status }, afterState: { status: input.status, resolutionNote: input.resolutionNote?.trim()||null },
        metadata: { companyId: c.companyId, requestType: current.requestType },
      }, tx);
      return updated[0];
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  private async actorUserId() {
    const c = this.tenantContext.getContext();
    const membership = await this.prisma.membership.findFirst({
      where: { id: c.membershipId, tenantId: c.tenantId, companyId: c.companyId, status: 'ACTIVE' },
      select: { userId: true },
    });
    if (!membership) throw new BadRequestException('Active administrator membership is required');
    return membership.userId;
  }

  private key(value: string) {
    return value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  }
}
