import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import type { CreateOpportunityInput } from './crm.schemas';

export interface OpportunityRow {
  id: string;
  customerId: string;
  ownerUserId: string | null;
  title: string;
  stage: string;
  estimatedValue: unknown;
  currency: string;
  probability: number;
  expectedCloseDate: Date | null;
  version: number;
}

@Injectable()
export class CrmOpportunityService {
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
      throw new BadRequestException('CRM mutation requires an active branch.');
    }
    return branchId;
  }

  private async assertAssignableUser(userId: string) {
    const context = this.context();
    const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT u.id
       FROM users u
       JOIN memberships m ON m."userId"=u.id
       JOIN roles r ON r.id=m."roleId" AND r."tenantId"=m."tenantId"
       WHERE u.id=$1::text AND m."tenantId"=$2::text
         AND m."companyId"=$3::text AND m.status='ACTIVE'
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
        'CRM assignee is not an active company member.',
      );
    }
  }

  async createFromCustomer(input: CreateOpportunityInput, actorUserId: string) {
    const context = this.context();
    const branchId = this.requireBranchId();

    if (input.ownerUserId) {
      await this.assertAssignableUser(input.ownerUserId);
    }

    return this.prisma.$transaction(async (tx) => {
      const customers = await tx.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT id
         FROM customers
         WHERE id=$1::text AND "tenantId"=$2::text AND "branchId"=$3::text
         LIMIT 1`,
        input.customerId,
        context.tenantId,
        branchId,
      );
      if (!customers.length) {
        throw new BadRequestException(
          'CRM customer is outside the active branch.',
        );
      }

      const rows = await tx.$queryRawUnsafe<OpportunityRow[]>(
        `INSERT INTO crm_opportunities(
           tenant_id,company_id,branch_id,customer_id,owner_user_id,title,
           estimated_value,currency,probability,expected_close_date,created_by_user_id
         ) VALUES(
           $1::text,$2::text,$3::text,$4::text,$5::text,$6,$7,$8,$9,$10,$11::text
         )
         RETURNING id,customer_id AS "customerId",owner_user_id AS "ownerUserId",title,stage,
                   estimated_value AS "estimatedValue",currency,probability,
                   expected_close_date AS "expectedCloseDate",version`,
        context.tenantId,
        context.companyId,
        branchId,
        input.customerId,
        input.ownerUserId ?? actorUserId,
        input.title,
        input.estimatedValue ?? null,
        input.currency,
        input.probability,
        input.expectedCloseDate ?? null,
        actorUserId,
      );

      const opportunity = rows[0];
      await tx.$executeRawUnsafe(
        `INSERT INTO crm_events(
           tenant_id,company_id,branch_id,opportunity_id,event_type,actor_user_id,metadata
         ) VALUES($1::text,$2::text,$3::text,$4::text,'OPPORTUNITY_CREATED',$5::text,$6::jsonb)`,
        context.tenantId,
        context.companyId,
        branchId,
        opportunity.id,
        actorUserId,
        JSON.stringify({ customerId: input.customerId, title: input.title }),
      );

      return opportunity;
    });
  }
}
