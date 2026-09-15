import { BadRequestException, ConflictException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import type { LinkWalkInCommercialContextInput } from './dto/walk-in-commercial.dto';

@Injectable()
export class OperationsWalkInCommercialService {
  constructor(private readonly prisma: PrismaService, private readonly tenantContext: TenantContext) {}

  private context() {
    const tenantId = this.tenantContext.getTenantId();
    const companyId = this.tenantContext.getCompanyId();
    const branchId = this.tenantContext.getBranchId();
    const membershipId = this.tenantContext.getMembershipId();
    if (!tenantId || !companyId || !membershipId) throw new InternalServerErrorException('Organization context is incomplete.');
    if (!branchId) throw new BadRequestException('A branch must be selected for this operation.');
    return { tenantId, companyId, branchId, membershipId };
  }

  async get(visitId: string) {
    const { tenantId, companyId, branchId } = this.context();
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT c.id,c.visit_id AS "visitId",c.sale_id AS "saleId",c.note,c.version,c.linked_at AS "linkedAt",
              s.status::text AS "saleStatus",s.total::text AS "saleTotal",
              COALESCE((SELECT SUM(sp.amount) FROM sale_payments sp WHERE sp."saleId"=s.id AND sp."tenantId"=$2 AND sp."branchId"=$4 AND sp.status::text='COMPLETED'),0)::text AS "paidTotal"
       FROM operations_walk_in_commercial_contexts c
       JOIN sales s ON s.id=c.sale_id
       WHERE c.visit_id=$1 AND c.tenant_id=$2 AND c.company_id=$3 AND c.branch_id=$4 LIMIT 1`,
      visitId, tenantId, companyId, branchId,
    );
    const context = rows[0];
    if (!context) return null;

    const serviceItems = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT si.id AS "saleItemId",si."serviceId" AS "serviceId",si.description,
              si.quantity,si."unitPrice"::text AS "unitPrice",si."lineTotal"::text AS "lineTotal",
              svc.name AS "serviceName",svc."durationMinutes" AS "durationMinutes"
       FROM sale_items si
       JOIN services svc ON svc.id=si."serviceId"
       WHERE si."saleId"=$1 AND si.type::text='SERVICE' AND si."serviceId" IS NOT NULL
         AND svc."tenantId"=$2 AND svc."branchId"=$3
       ORDER BY si."createdAt" ASC,si.id ASC`,
      context.saleId, tenantId, branchId,
    );

    return { ...context, serviceItems };
  }

  async link(visitId: string, input: LinkWalkInCommercialContextInput) {
    const { tenantId, companyId, branchId, membershipId } = this.context();
    return this.prisma.$transaction(async tx => {
      await tx.$queryRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))`, `${tenantId}:${branchId}`, `walk-in-commercial:${visitId}`);
      const visits = await tx.$queryRawUnsafe<Array<{ customerId: string; source: string; status: string }>>(
        `SELECT "customerId" AS "customerId","source"::text AS source,"status"::text AS status FROM visits WHERE id=$1 AND "tenantId"=$2 AND "companyId"=$3 AND "branchId"=$4 LIMIT 1`,
        visitId, tenantId, companyId, branchId,
      );
      const visit = visits[0];
      if (!visit) throw new NotFoundException('Visit not found.');
      if (visit.source !== 'WALK_IN') throw new BadRequestException('Commercial context can only be linked to walk-in visits.');
      if (visit.status === 'CHECKED_OUT' || visit.status === 'CANCELLED') throw new ConflictException('Closed visits cannot change commercial context.');

      const sales = await tx.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT s.id FROM sales s
         WHERE s.id=$1 AND s."tenantId"=$2 AND s."branchId"=$3 AND s."customerId"=$4 AND s.status::text='CONFIRMED'
           AND EXISTS (SELECT 1 FROM sale_items si WHERE si."saleId"=s.id AND si.type::text='SERVICE' AND si."serviceId" IS NOT NULL)
         LIMIT 1`, input.saleId, tenantId, branchId, visit.customerId,
      );
      if (!sales[0]) throw new BadRequestException('Sale must be a confirmed service sale for the same walk-in customer and branch.');

      const existing = await tx.$queryRawUnsafe<Array<{ version: number }>>(
        `SELECT version FROM operations_walk_in_commercial_contexts WHERE visit_id=$1 AND tenant_id=$2 AND company_id=$3 AND branch_id=$4 LIMIT 1`,
        visitId, tenantId, companyId, branchId,
      );
      if (existing[0] && existing[0].version !== input.expectedVersion) throw new ConflictException('Commercial context changed since it was read. Refresh and retry.');
      if (!existing[0] && input.expectedVersion !== 0) throw new ConflictException('Commercial context does not exist at the expected version.');

      const rows = await tx.$queryRawUnsafe<any[]>(
        `INSERT INTO operations_walk_in_commercial_contexts(tenant_id,company_id,branch_id,visit_id,sale_id,linked_by_membership_id,note)
         VALUES($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (visit_id) DO UPDATE SET sale_id=EXCLUDED.sale_id,linked_by_membership_id=EXCLUDED.linked_by_membership_id,note=EXCLUDED.note,linked_at=CURRENT_TIMESTAMP,version=operations_walk_in_commercial_contexts.version+1,updated_at=CURRENT_TIMESTAMP
         WHERE operations_walk_in_commercial_contexts.version=$8
         RETURNING id,visit_id AS "visitId",sale_id AS "saleId",note,version,linked_at AS "linkedAt"`,
        tenantId, companyId, branchId, visitId, input.saleId, membershipId, input.note ?? null, input.expectedVersion,
      );
      if (!rows[0]) throw new ConflictException('Commercial context changed during update.');
      await tx.$executeRawUnsafe(
        `INSERT INTO visit_events("id","visitId","tenantId","branchId","actorMembershipId","eventType","fromStatus","toStatus","note","createdAt")
         VALUES(gen_random_uuid()::text,$1,$2,$3,$4,'WALK_IN_COMMERCIAL_LINKED',$5::"VisitStatus",$5::"VisitStatus",$6,CURRENT_TIMESTAMP)`,
        visitId, tenantId, branchId, membershipId, visit.status, `Sale ${input.saleId} linked to walk-in visit.`,
      );
      return rows[0];
    });
  }
}
