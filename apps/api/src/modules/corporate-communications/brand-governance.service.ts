import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import type { UpsertBrandGovernanceInput } from './brand-governance.schemas';

type GovernanceRow = {
  id: string;
  branchId: string | null;
  name: string;
  toneOfVoice: string | null;
  brandPersonality: unknown;
  allowedPhrases: unknown;
  forbiddenPhrases: unknown;
  hashtagRules: unknown;
  colorTokens: unknown;
  fontTokens: unknown;
  logoRules: unknown;
  contentRules: unknown;
  revision: number;
  updatedAt: Date;
};

@Injectable()
export class BrandGovernanceService {
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
    if (!branch) throw new BadRequestException('Brand governance branch is outside the active company.');
  }

  async list() {
    const { tenantId, companyId, branchId } = this.context();
    const rows = await this.prisma.$queryRawUnsafe<GovernanceRow[]>(
      `SELECT p.id,p.branch_id AS "branchId",p.name,p.tone_of_voice AS "toneOfVoice",
              p.brand_personality AS "brandPersonality",p.allowed_phrases AS "allowedPhrases",
              p.forbidden_phrases AS "forbiddenPhrases",p.hashtag_rules AS "hashtagRules",
              p.color_tokens AS "colorTokens",p.font_tokens AS "fontTokens",p.logo_rules AS "logoRules",
              p.content_rules AS "contentRules",p.revision,p.updated_at AS "updatedAt",b.name AS "branchName"
       FROM corporate_brand_governance_profiles p
       LEFT JOIN branches b ON b.id=p.branch_id
       WHERE p.tenant_id=$1::text AND p.company_id=$2::text AND p.active=TRUE
         AND ($3::text IS NULL OR p.branch_id IS NULL OR p.branch_id=$3::text)
       ORDER BY CASE WHEN p.branch_id IS NULL THEN 0 ELSE 1 END,b.name,p.id`,
      tenantId,
      companyId,
      branchId,
    );

    const companyDefault = rows.find((row) => row.branchId === null) ?? null;
    const branchOverride = branchId
      ? rows.find((row) => row.branchId === branchId) ?? null
      : null;

    return { profiles: rows, companyDefault, branchOverride };
  }

  async upsert(input: UpsertBrandGovernanceInput, actorUserId: string) {
    const context = this.context();
    const requestedBranchId = input.branchId ?? null;

    if (context.branchId) {
      if (requestedBranchId !== context.branchId) {
        throw new BadRequestException('Branch-scoped users may only manage their active branch governance profile.');
      }
    } else if (requestedBranchId) {
      await this.assertBranch(requestedBranchId);
    }

    if (requestedBranchId) await this.assertBranch(requestedBranchId);

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.$queryRawUnsafe<Array<{ id: string; revision: number }>>(
        `SELECT id,revision FROM corporate_brand_governance_profiles
         WHERE tenant_id=$1::text AND company_id=$2::text AND branch_id IS NOT DISTINCT FROM $3::text
           AND active=TRUE FOR UPDATE`,
        context.tenantId,
        context.companyId,
        requestedBranchId,
      );

      let row: GovernanceRow;
      let eventType: 'CREATED' | 'UPDATED';

      if (existing.length) {
        [row] = await tx.$queryRawUnsafe<GovernanceRow[]>(
          `UPDATE corporate_brand_governance_profiles SET
             name=$4,tone_of_voice=$5,brand_personality=$6::jsonb,allowed_phrases=$7::jsonb,
             forbidden_phrases=$8::jsonb,hashtag_rules=$9::jsonb,color_tokens=$10::jsonb,
             font_tokens=$11::jsonb,logo_rules=$12::jsonb,content_rules=$13::jsonb,
             revision=revision+1,updated_by_user_id=$14::text,updated_at=NOW()
           WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text
           RETURNING id,branch_id AS "branchId",name,tone_of_voice AS "toneOfVoice",
                     brand_personality AS "brandPersonality",allowed_phrases AS "allowedPhrases",
                     forbidden_phrases AS "forbiddenPhrases",hashtag_rules AS "hashtagRules",
                     color_tokens AS "colorTokens",font_tokens AS "fontTokens",logo_rules AS "logoRules",
                     content_rules AS "contentRules",revision,updated_at AS "updatedAt"`,
          existing[0].id,
          context.tenantId,
          context.companyId,
          input.name,
          input.toneOfVoice ?? null,
          JSON.stringify(input.brandPersonality),
          JSON.stringify(input.allowedPhrases),
          JSON.stringify(input.forbiddenPhrases),
          JSON.stringify(input.hashtagRules),
          JSON.stringify(input.colorTokens),
          JSON.stringify(input.fontTokens),
          JSON.stringify(input.logoRules),
          JSON.stringify(input.contentRules),
          actorUserId,
        );
        eventType = 'UPDATED';
      } else {
        [row] = await tx.$queryRawUnsafe<GovernanceRow[]>(
          `INSERT INTO corporate_brand_governance_profiles(
             tenant_id,company_id,branch_id,name,tone_of_voice,brand_personality,allowed_phrases,
             forbidden_phrases,hashtag_rules,color_tokens,font_tokens,logo_rules,content_rules,
             created_by_user_id,updated_by_user_id
           ) VALUES($1::text,$2::text,$3::text,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb,$10::jsonb,$11::jsonb,$12::jsonb,$13::jsonb,$14::text,$14::text)
           RETURNING id,branch_id AS "branchId",name,tone_of_voice AS "toneOfVoice",
                     brand_personality AS "brandPersonality",allowed_phrases AS "allowedPhrases",
                     forbidden_phrases AS "forbiddenPhrases",hashtag_rules AS "hashtagRules",
                     color_tokens AS "colorTokens",font_tokens AS "fontTokens",logo_rules AS "logoRules",
                     content_rules AS "contentRules",revision,updated_at AS "updatedAt"`,
          context.tenantId,
          context.companyId,
          requestedBranchId,
          input.name,
          input.toneOfVoice ?? null,
          JSON.stringify(input.brandPersonality),
          JSON.stringify(input.allowedPhrases),
          JSON.stringify(input.forbiddenPhrases),
          JSON.stringify(input.hashtagRules),
          JSON.stringify(input.colorTokens),
          JSON.stringify(input.fontTokens),
          JSON.stringify(input.logoRules),
          JSON.stringify(input.contentRules),
          actorUserId,
        );
        eventType = 'CREATED';
      }

      await this.appendEvent(tx, row, actorUserId, eventType);
      return row;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  private async appendEvent(
    tx: Prisma.TransactionClient,
    row: GovernanceRow,
    actorUserId: string,
    eventType: string,
  ) {
    const { tenantId, companyId } = this.context();
    const snapshot = {
      name: row.name,
      toneOfVoice: row.toneOfVoice,
      brandPersonality: row.brandPersonality,
      allowedPhrases: row.allowedPhrases,
      forbiddenPhrases: row.forbiddenPhrases,
      hashtagRules: row.hashtagRules,
      colorTokens: row.colorTokens,
      fontTokens: row.fontTokens,
      logoRules: row.logoRules,
      contentRules: row.contentRules,
    };
    await tx.$executeRawUnsafe(
      `INSERT INTO corporate_brand_governance_events(
         tenant_id,company_id,branch_id,profile_id,event_type,actor_user_id,revision,snapshot
       ) VALUES($1::text,$2::text,$3::text,$4::text,$5,$6::text,$7,$8::jsonb)`,
      tenantId,
      companyId,
      row.branchId,
      row.id,
      eventType,
      actorUserId,
      row.revision,
      JSON.stringify(snapshot),
    );
  }
}
