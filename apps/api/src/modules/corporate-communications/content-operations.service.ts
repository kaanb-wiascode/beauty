import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import type {
  ContentDecisionInput,
  CreateContentItemInput,
  PublishContentInput,
  ScheduleContentInput,
  UpdateContentDraftInput,
} from './corporate-communications.schemas';

type ContentRow = {
  id: string;
  branchId: string | null;
  status: string;
  [key: string]: unknown;
};

@Injectable()
export class ContentOperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  private context() {
    return this.tenantContext.getContext();
  }

  private async assertBranch(branchId: string) {
    const { companyId } = this.context();
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, companyId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!branch) throw new BadRequestException('Content branch is outside the active company.');
  }

  private async assertCampaign(campaignId: string, branchId: string | null) {
    const { tenantId, companyId } = this.context();
    const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM corporate_communication_campaigns
       WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text
         AND ($4::text IS NULL OR branch_id IS NULL OR branch_id=$4::text)
       LIMIT 1`,
      campaignId,
      tenantId,
      companyId,
      branchId,
    );
    if (!rows.length) throw new BadRequestException('Content campaign is outside the allowed scope.');
  }

  private async assertOwner(userId: string, branchId: string | null) {
    const { tenantId, companyId } = this.context();
    const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT u.id
       FROM users u
       JOIN memberships m ON m."userId"=u.id
       JOIN roles r ON r.id=m."roleId" AND r."tenantId"=m."tenantId"
       WHERE u.id=$1::text AND m."tenantId"=$2::text AND m."companyId"=$3::text
         AND m.status='ACTIVE'
         AND ($4::text IS NULL OR r.scope<>'BRANCH' OR EXISTS(
           SELECT 1 FROM membership_branch_access mba
           WHERE mba."membershipId"=m.id AND mba."branchId"=$4::text
         ))
       LIMIT 1`,
      userId,
      tenantId,
      companyId,
      branchId,
    );
    if (!rows.length) throw new BadRequestException('Content owner is not eligible in this scope.');
  }

  async list(filters: {
    status?: string;
    platform?: string;
    campaignId?: string;
    from?: Date;
    to?: Date;
    limit: number;
  }) {
    const { tenantId, companyId, branchId } = this.context();
    return this.prisma.$queryRawUnsafe<ContentRow[]>(
      `SELECT c.id,c.branch_id AS "branchId",c.campaign_id AS "campaignId",c.title,c.platform,c.format,c.status,
              c.caption,c.cta,c.scheduled_at AS "scheduledAt",c.published_at AS "publishedAt",
              c.owner_user_id AS "ownerUserId",c.metadata,c.created_at AS "createdAt",c.updated_at AS "updatedAt",
              cam.name AS "campaignName",
              a.id AS "pendingApprovalId",a.created_at AS "approvalRequestedAt"
       FROM corporate_content_items c
       LEFT JOIN corporate_communication_campaigns cam ON cam.id=c.campaign_id
       LEFT JOIN corporate_content_approvals a ON a.content_id=c.id AND a.status='PENDING'
       WHERE c.tenant_id=$1::text AND c.company_id=$2::text
         AND ($3::text IS NULL OR c.branch_id IS NULL OR c.branch_id=$3::text)
         AND ($4::text IS NULL OR c.status=$4::text)
         AND ($5::text IS NULL OR c.platform=$5::text)
         AND ($6::text IS NULL OR c.campaign_id=$6::text)
         AND ($7::timestamptz IS NULL OR COALESCE(c.scheduled_at,c.created_at)>=$7::timestamptz)
         AND ($8::timestamptz IS NULL OR COALESCE(c.scheduled_at,c.created_at)<=$8::timestamptz)
       ORDER BY COALESCE(c.scheduled_at,c.updated_at) DESC,c.id
       LIMIT $9`,
      tenantId,
      companyId,
      branchId,
      filters.status ?? null,
      filters.platform ?? null,
      filters.campaignId ?? null,
      filters.from ?? null,
      filters.to ?? null,
      filters.limit,
    );
  }

  async create(input: CreateContentItemInput, actorUserId: string) {
    const context = this.context();
    const branchId = input.branchId === undefined ? context.branchId : input.branchId;
    if (branchId) await this.assertBranch(branchId);
    if (context.branchId && branchId && branchId !== context.branchId) {
      throw new BadRequestException('Content cannot be created outside the active branch.');
    }
    if (input.campaignId) await this.assertCampaign(input.campaignId, branchId ?? null);
    if (input.ownerUserId) await this.assertOwner(input.ownerUserId, branchId ?? null);

    return this.prisma.$transaction(async (tx) => {
      const [content] = await tx.$queryRawUnsafe<ContentRow[]>(
        `INSERT INTO corporate_content_items(
           tenant_id,company_id,branch_id,campaign_id,title,platform,format,caption,cta,
           owner_user_id,metadata,created_by_user_id
         ) VALUES($1::text,$2::text,$3::text,$4::text,$5,$6,$7,$8,$9,$10::text,$11::jsonb,$12::text)
         RETURNING id,branch_id AS "branchId",campaign_id AS "campaignId",title,platform,format,status,
                   caption,cta,owner_user_id AS "ownerUserId",metadata,created_at AS "createdAt"`,
        context.tenantId,
        context.companyId,
        branchId ?? null,
        input.campaignId ?? null,
        input.title,
        input.platform,
        input.format,
        input.caption ?? null,
        input.cta ?? null,
        input.ownerUserId ?? actorUserId,
        JSON.stringify(input.metadata),
        actorUserId,
      );
      await this.appendEvent(tx, content.id, branchId ?? null, null, 'CONTENT_CREATED', actorUserId, {
        platform: input.platform,
        format: input.format,
      });
      return content;
    });
  }

  async updateDraft(id: string, input: UpdateContentDraftInput, actorUserId: string) {
    const context = this.context();
    if (input.campaignId) await this.assertCampaign(input.campaignId, context.branchId);
    if (input.ownerUserId) await this.assertOwner(input.ownerUserId, context.branchId);

    return this.prisma.$transaction(async (tx) => {
      const current = await this.lockContent(tx, id);
      if (!['IDEA', 'BRIEF', 'PRODUCTION'].includes(current.status)) {
        throw new ConflictException('Only draft/production content can be edited.');
      }
      const rows = await tx.$queryRawUnsafe<ContentRow[]>(
        `UPDATE corporate_content_items SET
           title=COALESCE($5,title),platform=COALESCE($6,platform),format=COALESCE($7,format),
           campaign_id=CASE WHEN $8::boolean THEN $9::text ELSE campaign_id END,
           caption=CASE WHEN $10::boolean THEN $11 ELSE caption END,
           cta=CASE WHEN $12::boolean THEN $13 ELSE cta END,
           owner_user_id=CASE WHEN $14::boolean THEN $15::text ELSE owner_user_id END,
           metadata=CASE WHEN $16::boolean THEN $17::jsonb ELSE metadata END,
           status=CASE WHEN status='IDEA' THEN 'BRIEF' ELSE status END,updated_at=NOW()
         WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text
           AND ($4::text IS NULL OR branch_id IS NULL OR branch_id=$4::text)
         RETURNING id,branch_id AS "branchId",title,platform,format,status,caption,cta,
                   scheduled_at AS "scheduledAt",published_at AS "publishedAt",updated_at AS "updatedAt"`,
        id,
        context.tenantId,
        context.companyId,
        context.branchId,
        input.title ?? null,
        input.platform ?? null,
        input.format ?? null,
        input.campaignId !== undefined,
        input.campaignId ?? null,
        input.caption !== undefined,
        input.caption ?? null,
        input.cta !== undefined,
        input.cta ?? null,
        input.ownerUserId !== undefined,
        input.ownerUserId ?? null,
        input.metadata !== undefined,
        JSON.stringify(input.metadata ?? {}),
      );
      await this.appendEvent(tx, id, current.branchId, null, 'CONTENT_UPDATED', actorUserId, {});
      return rows[0];
    });
  }

  async submitForReview(id: string, actorUserId: string) {
    const context = this.context();
    return this.prisma.$transaction(async (tx) => {
      const content = await this.lockContent(tx, id);
      const pending = await tx.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT id FROM corporate_content_approvals
         WHERE content_id=$1::text AND tenant_id=$2::text AND company_id=$3::text
           AND branch_id IS NOT DISTINCT FROM $4::text AND status='PENDING'
         LIMIT 1`,
        id,
        context.tenantId,
        context.companyId,
        content.branchId,
      );
      if (pending.length) return { approvalId: pending[0].id, idempotent: true };

      if (!['IDEA', 'BRIEF', 'PRODUCTION'].includes(content.status)) {
        throw new ConflictException('Content is not in a reviewable state.');
      }

      await tx.$executeRawUnsafe(
        `UPDATE corporate_content_items SET status='REVIEW',updated_at=NOW() WHERE id=$1::text`,
        id,
      );
      const [approval] = await tx.$queryRawUnsafe<Array<{ id: string }>>(
        `INSERT INTO corporate_content_approvals(
           tenant_id,company_id,branch_id,content_id,requested_by_user_id
         ) VALUES($1::text,$2::text,$3::text,$4::text,$5::text)
         RETURNING id`,
        context.tenantId,
        context.companyId,
        content.branchId,
        id,
        actorUserId,
      );
      await this.appendEvent(tx, id, content.branchId, approval.id, 'REVIEW_REQUESTED', actorUserId, {});
      return { approvalId: approval.id, idempotent: false };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async listApprovals(status?: string) {
    const { tenantId, companyId, branchId } = this.context();
    return this.prisma.$queryRawUnsafe<ContentRow[]>(
      `SELECT a.id,a.content_id AS "contentId",a.status,a.requested_by_user_id AS "requestedByUserId",
              a.reviewer_user_id AS "reviewerUserId",a.decision_note AS "decisionNote",
              a.decided_at AS "decidedAt",a.created_at AS "createdAt",
              c.title,c.platform,c.format,c.status AS "contentStatus",c.branch_id AS "branchId"
       FROM corporate_content_approvals a
       JOIN corporate_content_items c ON c.id=a.content_id
       WHERE a.tenant_id=$1::text AND a.company_id=$2::text
         AND ($3::text IS NULL OR a.branch_id IS NULL OR a.branch_id=$3::text)
         AND ($4::text IS NULL OR a.status=$4::text)
       ORDER BY CASE WHEN a.status='PENDING' THEN 0 ELSE 1 END,a.created_at DESC,a.id`,
      tenantId,
      companyId,
      branchId,
      status ?? null,
    );
  }

  async decideApproval(
    approvalId: string,
    decision: 'APPROVED' | 'CHANGES_REQUESTED',
    input: ContentDecisionInput,
    actorUserId: string,
  ) {
    const context = this.context();
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRawUnsafe<Array<{
        id: string;
        contentId: string;
        branchId: string | null;
        status: string;
      }>>(
        `SELECT a.id,a.content_id AS "contentId",a.branch_id AS "branchId",a.status
         FROM corporate_content_approvals a
         WHERE a.id=$1::text AND a.tenant_id=$2::text AND a.company_id=$3::text
           AND ($4::text IS NULL OR a.branch_id IS NULL OR a.branch_id=$4::text)
         FOR UPDATE`,
        approvalId,
        context.tenantId,
        context.companyId,
        context.branchId,
      );
      const approval = rows[0];
      if (!approval) throw new NotFoundException('Content approval not found.');
      if (approval.status !== 'PENDING') {
        throw new ConflictException('Content approval is already decided.');
      }

      const nextContentStatus = decision === 'APPROVED' ? 'APPROVED' : 'PRODUCTION';
      await tx.$executeRawUnsafe(
        `UPDATE corporate_content_approvals
         SET status=$5,reviewer_user_id=$6::text,decision_note=$7,decided_at=NOW(),updated_at=NOW()
         WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text
           AND ($4::text IS NULL OR branch_id IS NULL OR branch_id=$4::text)`,
        approvalId,
        context.tenantId,
        context.companyId,
        context.branchId,
        decision,
        actorUserId,
        input.note,
      );
      await tx.$executeRawUnsafe(
        `UPDATE corporate_content_items SET status=$2,updated_at=NOW() WHERE id=$1::text`,
        approval.contentId,
        nextContentStatus,
      );
      await this.appendEvent(
        tx,
        approval.contentId,
        approval.branchId,
        approval.id,
        decision === 'APPROVED' ? 'CONTENT_APPROVED' : 'CHANGES_REQUESTED',
        actorUserId,
        { note: input.note },
      );
      return { approvalId, contentId: approval.contentId, status: decision, contentStatus: nextContentStatus };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async schedule(id: string, input: ScheduleContentInput, actorUserId: string) {
    return this.prisma.$transaction(async (tx) => {
      const content = await this.lockContent(tx, id);
      if (content.status !== 'APPROVED') {
        throw new ConflictException('Only approved content can be scheduled.');
      }
      await tx.$executeRawUnsafe(
        `UPDATE corporate_content_items SET status='SCHEDULED',scheduled_at=$2::timestamptz,updated_at=NOW()
         WHERE id=$1::text`,
        id,
        input.scheduledAt,
      );
      await this.appendEvent(tx, id, content.branchId, null, 'CONTENT_SCHEDULED', actorUserId, {
        scheduledAt: input.scheduledAt.toISOString(),
      });
      return { id, status: 'SCHEDULED', scheduledAt: input.scheduledAt };
    });
  }

  async publish(id: string, input: PublishContentInput, actorUserId: string) {
    return this.prisma.$transaction(async (tx) => {
      const content = await this.lockContent(tx, id);
      if (!['APPROVED', 'SCHEDULED'].includes(content.status)) {
        throw new ConflictException('Only approved or scheduled content can be published.');
      }
      const publishedAt = input.publishedAt ?? new Date();
      await tx.$executeRawUnsafe(
        `UPDATE corporate_content_items SET status='PUBLISHED',published_at=$2::timestamptz,updated_at=NOW()
         WHERE id=$1::text`,
        id,
        publishedAt,
      );
      await this.appendEvent(tx, id, content.branchId, null, 'CONTENT_PUBLISHED', actorUserId, {
        publishedAt: publishedAt.toISOString(),
      });
      return { id, status: 'PUBLISHED', publishedAt };
    });
  }

  private async lockContent(tx: Prisma.TransactionClient, id: string) {
    const context = this.context();
    const rows = await tx.$queryRawUnsafe<ContentRow[]>(
      `SELECT id,branch_id AS "branchId",status
       FROM corporate_content_items
       WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text
         AND ($4::text IS NULL OR branch_id IS NULL OR branch_id=$4::text)
       FOR UPDATE`,
      id,
      context.tenantId,
      context.companyId,
      context.branchId,
    );
    if (!rows.length) throw new NotFoundException('Content item not found.');
    return rows[0];
  }

  private async appendEvent(
    tx: Prisma.TransactionClient,
    contentId: string,
    branchId: string | null,
    approvalId: string | null,
    eventType: string,
    actorUserId: string,
    metadata: Record<string, unknown>,
  ) {
    const context = this.context();
    await tx.$executeRawUnsafe(
      `INSERT INTO corporate_content_events(
         tenant_id,company_id,branch_id,content_id,approval_id,event_type,actor_user_id,metadata
       ) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6,$7::text,$8::jsonb)`,
      context.tenantId,
      context.companyId,
      branchId,
      contentId,
      approvalId,
      eventType,
      actorUserId,
      JSON.stringify(metadata),
    );
  }
}
