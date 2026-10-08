import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

export type UpdateOpportunityCommercialInput = {
  version: number;
  estimatedValue?: number | null;
  probability?: number;
  expectedCloseDate?: Date | null;
  ownerUserId?: string | null;
};

type UpdatedOpportunityRow = {
  id: string;
  estimatedValue: unknown;
  probability: number;
  expectedCloseDate: Date | null;
  ownerUserId: string | null;
  version: number;
  updatedAt: Date;
};

@Injectable()
export class CrmOpportunityCommercialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  private context() {
    return this.tenantContext.getContext();
  }

  private requireBranchId() {
    const branchId = this.context().branchId;
    if (!branchId) {
      throw new BadRequestException(
        'CRM opportunity update requires an active branch.',
      );
    }
    return branchId;
  }

  private async assertAssignableUser(
    userId: string,
    tx: Prisma.TransactionClient,
  ) {
    const context = this.context();
    const rows = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT u.id
         FROM users u
         JOIN memberships m ON m."userId"=u.id
         JOIN roles r ON r.id=m."roleId" AND r."tenantId"=m."tenantId"
        WHERE u.id=$1::text
          AND m."tenantId"=$2::text
          AND m."companyId"=$3::text
          AND m.status='ACTIVE'
          AND ($4::text IS NULL OR r.scope<>'BRANCH' OR EXISTS(
            SELECT 1 FROM membership_branch_access mba
             WHERE mba."membershipId"=m.id AND mba."branchId"=$4::text
          ))
        LIMIT 1`,
      userId,
      context.tenantId,
      context.companyId,
      context.branchId,
    );
    if (!rows.length) {
      throw new BadRequestException(
        'CRM opportunity owner is not an active company member.',
      );
    }
  }

  async update(
    id: string,
    input: UpdateOpportunityCommercialInput,
    actorUserId: string,
  ) {
    const context = this.context();
    const branchId = this.requireBranchId();

    return this.prisma.$transaction(async (tx) => {
      if (input.ownerUserId) {
        await this.assertAssignableUser(input.ownerUserId, tx);
      }

      const rows = await tx.$queryRawUnsafe<UpdatedOpportunityRow[]>(
        `UPDATE crm_opportunities SET
           estimated_value=CASE WHEN $6::boolean THEN $7 ELSE estimated_value END,
           probability=CASE WHEN $8::boolean THEN $9 ELSE probability END,
           expected_close_date=CASE WHEN $10::boolean THEN $11 ELSE expected_close_date END,
           owner_user_id=CASE WHEN $12::boolean THEN $13::text ELSE owner_user_id END,
           version=version+1,
           updated_at=NOW()
         WHERE id=$1::text
           AND tenant_id=$2::text
           AND company_id=$3::text
           AND branch_id=$4::text
           AND version=$5
           AND stage NOT IN ('WON','LOST')
         RETURNING id,
                   estimated_value AS "estimatedValue",
                   probability,
                   expected_close_date AS "expectedCloseDate",
                   owner_user_id AS "ownerUserId",
                   version,
                   updated_at AS "updatedAt"`,
        id,
        context.tenantId,
        context.companyId,
        branchId,
        input.version,
        input.estimatedValue !== undefined,
        input.estimatedValue ?? null,
        input.probability !== undefined,
        input.probability ?? null,
        input.expectedCloseDate !== undefined,
        input.expectedCloseDate ?? null,
        input.ownerUserId !== undefined,
        input.ownerUserId ?? null,
      );

      if (!rows.length) {
        throw new ConflictException(
          'Opportunity changed, is closed, or is outside the active scope.',
        );
      }

      await tx.$executeRawUnsafe(
        `INSERT INTO crm_events(
           tenant_id,company_id,branch_id,opportunity_id,event_type,actor_user_id,metadata
         )
         SELECT tenant_id,company_id,branch_id,id,'OPPORTUNITY_COMMERCIAL_UPDATED',$2::text,$3::jsonb
           FROM crm_opportunities
          WHERE id=$1::text`,
        id,
        actorUserId,
        JSON.stringify({
          estimatedValue:
            input.estimatedValue !== undefined ? input.estimatedValue : undefined,
          probability:
            input.probability !== undefined ? input.probability : undefined,
          expectedCloseDate:
            input.expectedCloseDate !== undefined
              ? input.expectedCloseDate?.toISOString() ?? null
              : undefined,
          ownerUserId:
            input.ownerUserId !== undefined ? input.ownerUserId : undefined,
        }),
      );

      return rows[0];
    });
  }
}
