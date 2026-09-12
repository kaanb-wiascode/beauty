import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

type SourceKind =
  | 'INSPECTION_CATEGORY'
  | 'CUSTOMER_FEEDBACK'
  | 'TRAINING_COMPLIANCE'
  | 'CUSTOM_METRIC';

type DimensionInput = {
  code: string;
  name: string;
  sourceKind: SourceKind;
  sourceKey?: string | null;
  weight: number;
};

type DimensionResult = DimensionInput & {
  rawScore: number | null;
  sourceCount: number;
  dataStatus: 'AVAILABLE' | 'NO_DATA' | 'UNSUPPORTED_SOURCE';
  effectiveWeight: number;
  weightedScore: number | null;
};

@Injectable()
export class QualityScoreService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
  ) {}

  private context() {
    return this.tenant.getContext();
  }

  private branchId() {
    const branchId = this.context().branchId;
    if (!branchId) throw new BadRequestException('Branch context is required.');
    return branchId;
  }

  private date(value: string, field: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) {
      throw new BadRequestException(`${field} must use YYYY-MM-DD.`);
    }
    return value;
  }

  async createPolicy(
    input: {
      name: string;
      missingDataStrategy?: 'EXCLUDE_AND_REWEIGHT' | 'ZERO_FILL';
      maxPenaltyPoints?: number;
      effectiveFrom: string;
      effectiveTo?: string | null;
      dimensions: DimensionInput[];
      penaltyRules?: { severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'; penaltyPoints: number }[];
    },
    actorUserId: string,
  ) {
    const c = this.context();
    const name = input.name?.trim();
    if (!name) throw new BadRequestException('Policy name is required.');
    if (!input.dimensions?.length) throw new BadRequestException('At least one score dimension is required.');
    const strategy = input.missingDataStrategy ?? 'EXCLUDE_AND_REWEIGHT';
    if (!['EXCLUDE_AND_REWEIGHT', 'ZERO_FILL'].includes(strategy)) {
      throw new BadRequestException('Unsupported missing data strategy.');
    }
    const maxPenalty = input.maxPenaltyPoints ?? 25;
    if (!Number.isFinite(maxPenalty) || maxPenalty < 0 || maxPenalty > 100) {
      throw new BadRequestException('maxPenaltyPoints must be between 0 and 100.');
    }
    const effectiveFrom = this.date(input.effectiveFrom, 'effectiveFrom');
    const effectiveTo = input.effectiveTo ? this.date(input.effectiveTo, 'effectiveTo') : null;
    if (effectiveTo && effectiveTo < effectiveFrom) {
      throw new BadRequestException('effectiveTo cannot be before effectiveFrom.');
    }

    const codes = new Set<string>();
    const dimensions = input.dimensions.map((item) => {
      const code = item.code?.trim().toUpperCase();
      const dimensionName = item.name?.trim();
      if (!code || !dimensionName) throw new BadRequestException('Dimension code and name are required.');
      if (codes.has(code)) throw new BadRequestException(`Duplicate dimension code: ${code}`);
      codes.add(code);
      if (!['INSPECTION_CATEGORY', 'CUSTOMER_FEEDBACK', 'TRAINING_COMPLIANCE', 'CUSTOM_METRIC'].includes(item.sourceKind)) {
        throw new BadRequestException(`Unsupported sourceKind for ${code}.`);
      }
      if (!Number.isFinite(item.weight) || item.weight <= 0) {
        throw new BadRequestException(`Weight for ${code} must be greater than zero.`);
      }
      if (item.sourceKind === 'INSPECTION_CATEGORY' && !item.sourceKey?.trim()) {
        throw new BadRequestException(`sourceKey is required for ${code}.`);
      }
      return { ...item, code, name: dimensionName, sourceKey: item.sourceKey?.trim() || null };
    });

    const penaltyRules = input.penaltyRules ?? [];
    const severities = new Set<string>();
    for (const rule of penaltyRules) {
      if (severities.has(rule.severity)) throw new BadRequestException(`Duplicate penalty severity: ${rule.severity}`);
      severities.add(rule.severity);
      if (!Number.isFinite(rule.penaltyPoints) || rule.penaltyPoints < 0 || rule.penaltyPoints > 100) {
        throw new BadRequestException(`Invalid penalty for ${rule.severity}.`);
      }
    }

    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(
          `SELECT pg_advisory_xact_lock(hashtext($1))`,
          `quality-score-policy:${c.tenantId}:${c.companyId}:${name}`,
        );
        const versions = await tx.$queryRawUnsafe<any[]>(
          `SELECT COALESCE(MAX(version),0)+1 AS version
           FROM quality_score_policies
           WHERE tenant_id=$1::text AND company_id=$2::text AND name=$3`,
          c.tenantId,
          c.companyId,
          name,
        );
        const version = Number(versions[0]?.version ?? 1);
        const policies = await tx.$queryRawUnsafe<any[]>(
          `INSERT INTO quality_score_policies(
             tenant_id,company_id,name,version,missing_data_strategy,max_penalty_points,
             effective_from,effective_to,created_by_user_id
           ) VALUES($1::text,$2::text,$3,$4,$5,$6,$7::date,$8::date,$9::text)
           RETURNING id,name,version,missing_data_strategy AS "missingDataStrategy",
                     max_penalty_points AS "maxPenaltyPoints",effective_from AS "effectiveFrom",
                     effective_to AS "effectiveTo",is_active AS "isActive",created_at AS "createdAt"`,
          c.tenantId,
          c.companyId,
          name,
          version,
          strategy,
          maxPenalty,
          effectiveFrom,
          effectiveTo,
          actorUserId,
        );
        const policy = policies[0];
        for (let index = 0; index < dimensions.length; index += 1) {
          const d = dimensions[index];
          await tx.$executeRawUnsafe(
            `INSERT INTO quality_score_policy_dimensions(
               policy_id,tenant_id,company_id,code,name,source_kind,source_key,weight,sort_order
             ) VALUES($1::text,$2::text,$3::text,$4,$5,$6,$7,$8,$9)`,
            policy.id,
            c.tenantId,
            c.companyId,
            d.code,
            d.name,
            d.sourceKind,
            d.sourceKey,
            d.weight,
            index,
          );
        }
        for (const rule of penaltyRules) {
          await tx.$executeRawUnsafe(
            `INSERT INTO quality_score_penalty_rules(
               policy_id,tenant_id,company_id,severity,penalty_points
             ) VALUES($1::text,$2::text,$3::text,$4,$5)`,
            policy.id,
            c.tenantId,
            c.companyId,
            rule.severity,
            rule.penaltyPoints,
          );
        }
        return { ...policy, dimensions, penaltyRules };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async listPolicies() {
    const c = this.context();
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT p.id,p.name,p.version,p.missing_data_strategy AS "missingDataStrategy",
              p.max_penalty_points AS "maxPenaltyPoints",p.effective_from AS "effectiveFrom",
              p.effective_to AS "effectiveTo",p.is_active AS "isActive",p.created_at AS "createdAt",
              COALESCE((SELECT jsonb_agg(jsonb_build_object(
                'code',d.code,'name',d.name,'sourceKind',d.source_kind,'sourceKey',d.source_key,'weight',d.weight
              ) ORDER BY d.sort_order,d.code) FROM quality_score_policy_dimensions d WHERE d.policy_id=p.id),'[]'::jsonb) AS dimensions,
              COALESCE((SELECT jsonb_agg(jsonb_build_object(
                'severity',r.severity,'penaltyPoints',r.penalty_points
              ) ORDER BY r.severity) FROM quality_score_penalty_rules r WHERE r.policy_id=p.id),'[]'::jsonb) AS "penaltyRules"
       FROM quality_score_policies p
       WHERE p.tenant_id=$1::text AND p.company_id=$2::text
       ORDER BY p.created_at DESC,p.version DESC`,
      c.tenantId,
      c.companyId,
    );
  }

  private async dimensionMetric(
    tx: Prisma.TransactionClient,
    dimension: any,
    periodStart: string,
    periodEnd: string,
    branchId: string,
  ): Promise<Pick<DimensionResult, 'rawScore' | 'sourceCount' | 'dataStatus'>> {
    const c = this.context();
    if (dimension.sourceKind === 'INSPECTION_CATEGORY') {
      const rows = await tx.$queryRawUnsafe<any[]>(
        `SELECT ROUND(AVG(i.score)::numeric,2) AS score,COUNT(*)::int AS count
         FROM quality_inspections i
         JOIN quality_inspection_templates t ON t.id=i.template_id
         WHERE i.tenant_id=$1::text AND i.company_id=$2::text AND i.branch_id=$3::text
           AND i.status='COMPLETED' AND i.score IS NOT NULL
           AND i.completed_at >= $4::date AND i.completed_at < ($5::date + INTERVAL '1 day')
           AND UPPER(t.category)=UPPER($6)`,
        c.tenantId,
        c.companyId,
        branchId,
        periodStart,
        periodEnd,
        dimension.sourceKey,
      );
      const count = Number(rows[0]?.count ?? 0);
      return { rawScore: count ? Number(rows[0].score) : null, sourceCount: count, dataStatus: count ? 'AVAILABLE' : 'NO_DATA' };
    }
    if (dimension.sourceKind === 'CUSTOMER_FEEDBACK') {
      const rows = await tx.$queryRawUnsafe<any[]>(
        `SELECT ROUND((AVG(overall_rating::numeric)/5*100)::numeric,2) AS score,COUNT(*)::int AS count
         FROM customer_feedback
         WHERE tenant_id=$1::text AND company_id=$2::text AND branch_id=$3::text
           AND overall_rating IS NOT NULL
           AND submitted_at >= $4::date AND submitted_at < ($5::date + INTERVAL '1 day')`,
        c.tenantId,
        c.companyId,
        branchId,
        periodStart,
        periodEnd,
      );
      const count = Number(rows[0]?.count ?? 0);
      return { rawScore: count ? Number(rows[0].score) : null, sourceCount: count, dataStatus: count ? 'AVAILABLE' : 'NO_DATA' };
    }
    if (dimension.sourceKind === 'TRAINING_COMPLIANCE') {
      const rows = await tx.$queryRawUnsafe<any[]>(
        `SELECT COUNT(*)::int AS count,
                COUNT(*) FILTER (
                  WHERE a.completed_at IS NOT NULL
                    AND a.completed_at < ($5::date + INTERVAL '1 day')
                )::int AS completed
         FROM training_assignments a
         JOIN training_courses course ON course.id=a.course_id
         WHERE a.tenant_id=$1::text AND a.company_id=$2::text AND a.branch_id=$3::text
           AND a.due_at IS NOT NULL
           AND a.due_at >= $4::date AND a.due_at < ($5::date + INTERVAL '1 day')
           AND a.assigned_at < ($5::date + INTERVAL '1 day')
           AND (a.cancelled_at IS NULL OR a.cancelled_at >= ($5::date + INTERVAL '1 day'))
           AND ($6::text IS NULL OR UPPER(course.code)=UPPER($6) OR UPPER(course.category)=UPPER($6))`,
        c.tenantId,
        c.companyId,
        branchId,
        periodStart,
        periodEnd,
        dimension.sourceKey ?? null,
      );
      const count = Number(rows[0]?.count ?? 0);
      const completed = Number(rows[0]?.completed ?? 0);
      const score = count ? Math.round((completed / count) * 10000) / 100 : null;
      return { rawScore: score, sourceCount: count, dataStatus: count ? 'AVAILABLE' : 'NO_DATA' };
    }
    return { rawScore: null, sourceCount: 0, dataStatus: 'UNSUPPORTED_SOURCE' };
  }

  async calculate(
    input: { periodStart: string; periodEnd: string; policyId?: string | null },
    actorUserId: string,
  ) {
    const c = this.context();
    const branchId = this.branchId();
    const periodStart = this.date(input.periodStart, 'periodStart');
    const periodEnd = this.date(input.periodEnd, 'periodEnd');
    if (periodEnd < periodStart) throw new BadRequestException('periodEnd cannot be before periodStart.');

    return this.prisma.$transaction(
      async (tx) => {
        const policyRows = await tx.$queryRawUnsafe<any[]>(
          input.policyId
            ? `SELECT id,name,version,missing_data_strategy AS "missingDataStrategy",max_penalty_points AS "maxPenaltyPoints"
               FROM quality_score_policies
               WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND is_active=true LIMIT 1`
            : `SELECT id,name,version,missing_data_strategy AS "missingDataStrategy",max_penalty_points AS "maxPenaltyPoints"
               FROM quality_score_policies
               WHERE tenant_id=$1::text AND company_id=$2::text AND is_active=true
                 AND effective_from <= $3::date AND (effective_to IS NULL OR effective_to >= $4::date)
               ORDER BY effective_from DESC,version DESC LIMIT 1`,
          ...(input.policyId
            ? [input.policyId, c.tenantId, c.companyId]
            : [c.tenantId, c.companyId, periodEnd, periodStart]),
        );
        if (!policyRows.length) throw new NotFoundException('No active quality score policy found for the period.');
        const policy = policyRows[0];
        const dimensions = await tx.$queryRawUnsafe<any[]>(
          `SELECT code,name,source_kind AS "sourceKind",source_key AS "sourceKey",weight
           FROM quality_score_policy_dimensions
           WHERE policy_id=$1::text AND tenant_id=$2::text AND company_id=$3::text
           ORDER BY sort_order,code`,
          policy.id,
          c.tenantId,
          c.companyId,
        );
        if (!dimensions.length) throw new BadRequestException('The selected quality score policy has no dimensions.');

        const results: DimensionResult[] = [];
        for (const d of dimensions) {
          const metric = await this.dimensionMetric(tx, d, periodStart, periodEnd, branchId);
          results.push({
            code: d.code,
            name: d.name,
            sourceKind: d.sourceKind,
            sourceKey: d.sourceKey,
            weight: Number(d.weight),
            ...metric,
            effectiveWeight: 0,
            weightedScore: null,
          });
        }

        const strategy = policy.missingDataStrategy as 'EXCLUDE_AND_REWEIGHT' | 'ZERO_FILL';
        const included = strategy === 'ZERO_FILL' ? results : results.filter((r) => r.rawScore != null);
        const weightTotal = included.reduce((sum, r) => sum + r.weight, 0);
        if (weightTotal <= 0) throw new BadRequestException('No scoreable data is available for this policy and period.');
        let baseScore = 0;
        for (const result of results) {
          const include = strategy === 'ZERO_FILL' || result.rawScore != null;
          if (!include) continue;
          result.effectiveWeight = result.weight / weightTotal;
          result.weightedScore = (result.rawScore ?? 0) * result.effectiveWeight;
          baseScore += result.weightedScore;
        }
        baseScore = Math.round(baseScore * 100) / 100;

        const penaltyRows = await tx.$queryRawUnsafe<any[]>(
          `SELECT r.severity,r.penalty_points AS "penaltyPoints",COUNT(f.id)::int AS count
           FROM quality_score_penalty_rules r
           LEFT JOIN quality_findings f ON f.tenant_id=$2::text AND f.company_id=$3::text AND f.branch_id=$4::text
             AND f.severity=r.severity AND f.created_at >= $5::date AND f.created_at < ($6::date + INTERVAL '1 day')
           WHERE r.policy_id=$1::text
           GROUP BY r.severity,r.penalty_points`,
          policy.id,
          c.tenantId,
          c.companyId,
          branchId,
          periodStart,
          periodEnd,
        );
        const uncappedPenalty = penaltyRows.reduce(
          (sum, row) => sum + Number(row.penaltyPoints) * Number(row.count),
          0,
        );
        const findingPenalty = Math.min(uncappedPenalty, Number(policy.maxPenaltyPoints));
        const finalScore = Math.max(0, Math.min(100, Math.round((baseScore - findingPenalty) * 100) / 100));
        const explanation = {
          policy: { id: policy.id, name: policy.name, version: policy.version },
          period: { start: periodStart, end: periodEnd },
          missingDataStrategy: strategy,
          baseScore,
          findingPenalty,
          uncappedPenalty,
          maxPenaltyPoints: Number(policy.maxPenaltyPoints),
          finalScore,
        };

        const runs = await tx.$queryRawUnsafe<any[]>(
          `INSERT INTO branch_quality_score_runs(
             tenant_id,company_id,branch_id,policy_id,policy_version,period_start,period_end,
             base_score,finding_penalty,final_score,missing_data_strategy,explanation,calculated_by_user_id
           ) VALUES($1::text,$2::text,$3::text,$4::text,$5,$6::date,$7::date,$8,$9,$10,$11,$12::jsonb,$13::text)
           RETURNING id,calculated_at AS "calculatedAt"`,
          c.tenantId,
          c.companyId,
          branchId,
          policy.id,
          policy.version,
          periodStart,
          periodEnd,
          baseScore,
          findingPenalty,
          finalScore,
          strategy,
          JSON.stringify(explanation),
          actorUserId,
        );
        const run = runs[0];
        for (const result of results) {
          await tx.$executeRawUnsafe(
            `INSERT INTO branch_quality_score_dimension_runs(
               run_id,tenant_id,company_id,branch_id,dimension_code,dimension_name,source_kind,source_key,
               configured_weight,effective_weight,raw_score,weighted_score,source_count,data_status
             ) VALUES($1::text,$2::text,$3::text,$4::text,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
            run.id,
            c.tenantId,
            c.companyId,
            branchId,
            result.code,
            result.name,
            result.sourceKind,
            result.sourceKey,
            result.weight,
            result.effectiveWeight,
            result.rawScore,
            result.weightedScore,
            result.sourceCount,
            result.dataStatus,
          );
        }

        await tx.$executeRawUnsafe(
          `INSERT INTO branch_quality_scores(
             tenant_id,company_id,branch_id,period_start,period_end,inspection_score,finding_penalty,final_score,
             calculated_at,latest_run_id,policy_id,policy_version,explanation,calculated_by_user_id
           ) VALUES($1::text,$2::text,$3::text,$4::date,$5::date,$6,$7,$8,NOW(),$9::text,$10::text,$11,$12::jsonb,$13::text)
           ON CONFLICT (tenant_id,company_id,branch_id,period_start,period_end)
           DO UPDATE SET inspection_score=EXCLUDED.inspection_score,finding_penalty=EXCLUDED.finding_penalty,
                         final_score=EXCLUDED.final_score,calculated_at=NOW(),latest_run_id=EXCLUDED.latest_run_id,
                         policy_id=EXCLUDED.policy_id,policy_version=EXCLUDED.policy_version,
                         explanation=EXCLUDED.explanation,calculated_by_user_id=EXCLUDED.calculated_by_user_id`,
          c.tenantId,
          c.companyId,
          branchId,
          periodStart,
          periodEnd,
          baseScore,
          findingPenalty,
          finalScore,
          run.id,
          policy.id,
          policy.version,
          JSON.stringify(explanation),
          actorUserId,
        );

        return { runId: run.id, calculatedAt: run.calculatedAt, ...explanation, dimensions: results, penaltyRules: penaltyRows };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async listScores(limit = 24) {
    const c = this.context();
    const branchId = this.branchId();
    const bounded = Math.min(Math.max(Number.isFinite(limit) ? limit : 24, 1), 100);
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT s.id,s.period_start AS "periodStart",s.period_end AS "periodEnd",
              s.inspection_score AS "baseScore",s.finding_penalty AS "findingPenalty",s.final_score AS "finalScore",
              s.policy_id AS "policyId",s.policy_version AS "policyVersion",s.latest_run_id AS "latestRunId",
              s.explanation,s.calculated_at AS "calculatedAt"
       FROM branch_quality_scores s
       WHERE s.tenant_id=$1::text AND s.company_id=$2::text AND s.branch_id=$3::text
       ORDER BY s.period_start DESC,s.calculated_at DESC
       LIMIT $4`,
      c.tenantId,
      c.companyId,
      branchId,
      bounded,
    );
  }
}
