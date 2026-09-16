import { Injectable } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

@Injectable()
export class QualityOverdueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
  ) {}

  async list(limit = 100) {
    const { tenantId, companyId, branchId } = this.tenant.getContext();
    const bounded = Math.min(Math.max(limit, 1), 200);
    const [findings, capas] = await Promise.all([
      this.prisma.$queryRawUnsafe<any[]>(
        `SELECT f.id,f.branch_id AS "branchId",f.severity,f.category,f.title,f.owner_user_id AS "ownerUserId",f.due_at AS "dueAt",f.overdue_at AS "overdueAt"
         FROM quality_findings f
         WHERE f.tenant_id=$1::text AND f.company_id=$2::text
           AND ($3::text IS NULL OR f.branch_id=$3::text)
           AND f.status<>'CLOSED' AND f.due_at IS NOT NULL AND f.due_at<NOW()
         ORDER BY f.due_at ASC LIMIT $4`,tenantId,companyId,branchId,bounded),
      this.prisma.$queryRawUnsafe<any[]>(
        `SELECT p.id,p.quality_case_id AS "qualityCaseId",p.branch_id AS "branchId",p.status,p.owner_user_id AS "ownerUserId",p.due_at AS "dueAt",p.overdue_at AS "overdueAt"
         FROM quality_capa_plans p
         WHERE p.tenant_id=$1::text AND p.company_id=$2::text
           AND ($3::text IS NULL OR p.branch_id=$3::text)
           AND p.status<>'CLOSED' AND p.due_at IS NOT NULL AND p.due_at<NOW()
         ORDER BY p.due_at ASC LIMIT $4`,tenantId,companyId,branchId,bounded),
    ]);
    return { findings, capas };
  }

  async process(actorUserId:string,limit=100){
    const { tenantId, companyId, branchId } = this.tenant.getContext();
    const bounded=Math.min(Math.max(limit,1),200);
    return this.prisma.$transaction(async tx=>{
      const findings=await tx.$queryRawUnsafe<any[]>(
        `WITH candidates AS (
           SELECT f.id FROM quality_findings f
           WHERE f.tenant_id=$1::text AND f.company_id=$2::text
             AND ($3::text IS NULL OR f.branch_id=$3::text)
             AND f.status<>'CLOSED' AND f.due_at IS NOT NULL AND f.due_at<NOW() AND f.overdue_at IS NULL
           ORDER BY f.due_at ASC LIMIT $4 FOR UPDATE SKIP LOCKED
         )
         UPDATE quality_findings f
         SET overdue_at=NOW(),updated_at=NOW()
         FROM candidates c WHERE f.id=c.id
         RETURNING f.id,f.branch_id AS "branchId",f.due_at AS "dueAt",f.overdue_at AS "overdueAt"`,tenantId,companyId,branchId,bounded);

      const capas=await tx.$queryRawUnsafe<any[]>(
        `WITH candidates AS (
           SELECT p.id FROM quality_capa_plans p
           WHERE p.tenant_id=$1::text AND p.company_id=$2::text
             AND ($3::text IS NULL OR p.branch_id=$3::text)
             AND p.status<>'CLOSED' AND p.due_at IS NOT NULL AND p.due_at<NOW() AND p.overdue_at IS NULL
           ORDER BY p.due_at ASC LIMIT $4 FOR UPDATE SKIP LOCKED
         ), updated AS (
           UPDATE quality_capa_plans p
           SET overdue_at=NOW(),updated_by_user_id=$5::text,updated_at=NOW()
           FROM candidates c WHERE p.id=c.id
           RETURNING p.id,p.tenant_id,p.company_id,p.branch_id,p.status,p.due_at,p.overdue_at
         ), events AS (
           INSERT INTO quality_capa_events(capa_id,tenant_id,company_id,branch_id,event_type,from_status,to_status,actor_user_id,note)
           SELECT u.id,u.tenant_id,u.company_id,u.branch_id,'OVERDUE',u.status,u.status,$5::text,'CAPA due date exceeded'
           FROM updated u RETURNING capa_id
         )
         SELECT u.id,u.branch_id AS "branchId",u.status,u.due_at AS "dueAt",u.overdue_at AS "overdueAt"
         FROM updated u ORDER BY u.due_at ASC`,tenantId,companyId,branchId,bounded,actorUserId);

      return {processedFindings:findings.length,processedCapas:capas.length,findings,capas};
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
  }
}
