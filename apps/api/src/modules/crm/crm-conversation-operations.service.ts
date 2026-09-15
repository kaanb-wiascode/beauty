import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

type SubjectType = 'CUSTOMER' | 'LEAD' | 'OPPORTUNITY';
type ConversationStatus = 'OPEN' | 'SNOOZED' | 'CLOSED';
type Scope = { tenantId: string; companyId: string; branchId: string };

@Injectable()
export class CrmConversationOperationsService {
  constructor(private readonly prisma: PrismaService, private readonly tenantContext: TenantContext) {}

  private scope(): Scope {
    const context = this.tenantContext.getContext();
    if (!context.branchId) throw new BadRequestException('Active branch is required.');
    return { tenantId: context.tenantId, companyId: context.companyId, branchId: context.branchId };
  }

  async policy() {
    const scope = this.scope();
    const rows = await this.prisma.$queryRawUnsafe<Array<{
      id: string; whatsappTargetMinutes: number; smsTargetMinutes: number; emailTargetMinutes: number;
      criticalAfterMinutes: number; version: number; updatedAt: Date;
    }>>(
      `SELECT id,whatsapp_target_minutes AS "whatsappTargetMinutes",sms_target_minutes AS "smsTargetMinutes",
              email_target_minutes AS "emailTargetMinutes",critical_after_minutes AS "criticalAfterMinutes",
              version,updated_at AS "updatedAt"
       FROM crm_conversation_sla_policies
       WHERE tenant_id=$1::text AND company_id=$2::text AND branch_id=$3::text LIMIT 1`,
      scope.tenantId, scope.companyId, scope.branchId,
    );
    return rows[0] ?? {
      id: null, whatsappTargetMinutes: 120, smsTargetMinutes: 120, emailTargetMinutes: 240,
      criticalAfterMinutes: 1440, version: 0, updatedAt: null,
    };
  }

  async savePolicy(input: {
    version?: number; whatsappTargetMinutes: number; smsTargetMinutes: number;
    emailTargetMinutes: number; criticalAfterMinutes: number;
  }, actorUserId: string) {
    const scope = this.scope();
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.$queryRawUnsafe<Array<{ id: string; version: number }>>(
        `SELECT id,version FROM crm_conversation_sla_policies
         WHERE tenant_id=$1::text AND company_id=$2::text AND branch_id=$3::text LIMIT 1 FOR UPDATE`,
        scope.tenantId, scope.companyId, scope.branchId,
      );
      if (!current[0]) {
        if (input.version && input.version !== 0) throw new ConflictException('Conversation SLA policy version changed.');
        const rows = await tx.$queryRawUnsafe<Array<{ id: string; version: number }>>(
          `INSERT INTO crm_conversation_sla_policies(
             tenant_id,company_id,branch_id,whatsapp_target_minutes,sms_target_minutes,email_target_minutes,
             critical_after_minutes,created_by_user_id,updated_by_user_id
           ) VALUES($1::text,$2::text,$3::text,$4,$5,$6,$7,$8::text,$8::text) RETURNING id,version`,
          scope.tenantId, scope.companyId, scope.branchId, input.whatsappTargetMinutes, input.smsTargetMinutes,
          input.emailTargetMinutes, input.criticalAfterMinutes, actorUserId,
        );
        return { ...input, id: rows[0].id, version: rows[0].version };
      }
      if (input.version !== current[0].version) throw new ConflictException('Conversation SLA policy version changed.');
      const rows = await tx.$queryRawUnsafe<Array<{ id: string; version: number }>>(
        `UPDATE crm_conversation_sla_policies
         SET whatsapp_target_minutes=$2,sms_target_minutes=$3,email_target_minutes=$4,critical_after_minutes=$5,
             updated_by_user_id=$6::text,version=version+1,updated_at=NOW()
         WHERE id=$1::text RETURNING id,version`,
        current[0].id, input.whatsappTargetMinutes, input.smsTargetMinutes,
        input.emailTargetMinutes, input.criticalAfterMinutes, actorUserId,
      );
      return { ...input, id: rows[0].id, version: rows[0].version };
    });
  }

  async assignment(subjectType: SubjectType, subjectId: string) {
    const scope = this.scope();
    await this.assertSubject(scope, subjectType, subjectId);
    const column = this.subjectColumn(subjectType);
    const rows = await this.prisma.$queryRawUnsafe<Array<{
      id: string; assignedUserId: string; firstName: string | null; lastName: string | null; version: number; assignedAt: Date;
    }>>(
      `SELECT a.id,a.assigned_user_id AS "assignedUserId",u."firstName",u."lastName",a.version,a.assigned_at AS "assignedAt"
       FROM crm_conversation_assignments a JOIN users u ON u.id=a.assigned_user_id
       WHERE a.tenant_id=$1::text AND a.company_id=$2::text AND a.branch_id=$3::text AND a.${column}=$4::text LIMIT 1`,
      scope.tenantId, scope.companyId, scope.branchId, subjectId,
    );
    return rows[0] ?? null;
  }

  async setAssignment(subjectType: SubjectType, subjectId: string, assignedUserId: string | null,
    expectedVersion: number | undefined, actorUserId: string) {
    const scope = this.scope();
    await this.assertSubject(scope, subjectType, subjectId);
    if (assignedUserId) await this.assertAssignableUser(scope, assignedUserId);
    const column = this.subjectColumn(subjectType);
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.$queryRawUnsafe<Array<{ id: string; version: number }>>(
        `SELECT id,version FROM crm_conversation_assignments
         WHERE tenant_id=$1::text AND company_id=$2::text AND branch_id=$3::text AND ${column}=$4::text LIMIT 1 FOR UPDATE`,
        scope.tenantId, scope.companyId, scope.branchId, subjectId,
      );
      if (!assignedUserId) {
        if (!current[0]) return { subjectType, subjectId, assignedUserId: null, version: 0 };
        if (expectedVersion !== current[0].version) throw new ConflictException('Conversation assignment version changed.');
        await tx.$executeRawUnsafe(`DELETE FROM crm_conversation_assignments WHERE id=$1::text`, current[0].id);
        return { subjectType, subjectId, assignedUserId: null, version: 0 };
      }
      if (!current[0]) {
        if (expectedVersion && expectedVersion !== 0) throw new ConflictException('Conversation assignment version changed.');
        const subject = this.subjectValues(subjectType, subjectId);
        const rows = await tx.$queryRawUnsafe<Array<{ id: string; version: number }>>(
          `INSERT INTO crm_conversation_assignments(
             tenant_id,company_id,branch_id,customer_id,lead_id,opportunity_id,assigned_user_id,assigned_by_user_id
           ) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6::text,$7::text,$8::text) RETURNING id,version`,
          scope.tenantId, scope.companyId, scope.branchId, subject.customerId, subject.leadId,
          subject.opportunityId, assignedUserId, actorUserId,
        );
        return { subjectType, subjectId, assignedUserId, id: rows[0].id, version: rows[0].version };
      }
      if (expectedVersion !== current[0].version) throw new ConflictException('Conversation assignment version changed.');
      const rows = await tx.$queryRawUnsafe<Array<{ id: string; version: number }>>(
        `UPDATE crm_conversation_assignments SET assigned_user_id=$2::text,assigned_by_user_id=$3::text,
           assigned_at=NOW(),version=version+1,updated_at=NOW() WHERE id=$1::text RETURNING id,version`,
        current[0].id, assignedUserId, actorUserId,
      );
      return { subjectType, subjectId, assignedUserId, id: rows[0].id, version: rows[0].version };
    });
  }

  async state(subjectType: SubjectType, subjectId: string) {
    const scope = this.scope();
    await this.assertSubject(scope, subjectType, subjectId);
    const column = this.subjectColumn(subjectType);
    const rows = await this.prisma.$queryRawUnsafe<Array<{
      id: string; status: ConversationStatus; snoozedUntil: Date | null; closedAt: Date | null; version: number; updatedAt: Date;
    }>>(
      `SELECT id,
              CASE WHEN status='SNOOZED' AND snoozed_until<=NOW() THEN 'OPEN' ELSE status END AS status,
              CASE WHEN status='SNOOZED' AND snoozed_until<=NOW() THEN NULL ELSE snoozed_until END AS "snoozedUntil",
              closed_at AS "closedAt",version,updated_at AS "updatedAt"
       FROM crm_conversation_states
       WHERE tenant_id=$1::text AND company_id=$2::text AND branch_id=$3::text AND ${column}=$4::text LIMIT 1`,
      scope.tenantId, scope.companyId, scope.branchId, subjectId,
    );
    return rows[0] ?? { id: null, status: 'OPEN' as const, snoozedUntil: null, closedAt: null, version: 0, updatedAt: null };
  }

  async setState(subjectType: SubjectType, subjectId: string, status: ConversationStatus,
    snoozedUntil: Date | null, expectedVersion: number | undefined, actorUserId: string) {
    const scope = this.scope();
    await this.assertSubject(scope, subjectType, subjectId);
    if (status === 'SNOOZED' && (!snoozedUntil || snoozedUntil.getTime() <= Date.now())) {
      throw new BadRequestException('Snooze time must be in the future.');
    }
    const column = this.subjectColumn(subjectType);
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.$queryRawUnsafe<Array<{ id: string; version: number }>>(
        `SELECT id,version FROM crm_conversation_states
         WHERE tenant_id=$1::text AND company_id=$2::text AND branch_id=$3::text AND ${column}=$4::text LIMIT 1 FOR UPDATE`,
        scope.tenantId, scope.companyId, scope.branchId, subjectId,
      );
      if (!current[0]) {
        if (expectedVersion && expectedVersion !== 0) throw new ConflictException('Conversation state version changed.');
        if (status === 'OPEN') return { subjectType, subjectId, status, snoozedUntil: null, closedAt: null, version: 0 };
        const subject = this.subjectValues(subjectType, subjectId);
        const rows = await tx.$queryRawUnsafe<Array<{ id: string; version: number; closedAt: Date | null }>>(
          `INSERT INTO crm_conversation_states(
             tenant_id,company_id,branch_id,customer_id,lead_id,opportunity_id,status,snoozed_until,
             closed_at,closed_by_user_id,updated_by_user_id
           ) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6::text,$7,$8,
             CASE WHEN $7='CLOSED' THEN NOW() ELSE NULL END,CASE WHEN $7='CLOSED' THEN $9::text ELSE NULL END,$9::text)
           RETURNING id,version,closed_at AS "closedAt"`,
          scope.tenantId, scope.companyId, scope.branchId, subject.customerId, subject.leadId,
          subject.opportunityId, status, status === 'SNOOZED' ? snoozedUntil : null, actorUserId,
        );
        return { subjectType, subjectId, status, snoozedUntil: status === 'SNOOZED' ? snoozedUntil : null,
          closedAt: rows[0].closedAt, id: rows[0].id, version: rows[0].version };
      }
      if (expectedVersion !== current[0].version) throw new ConflictException('Conversation state version changed.');
      const rows = await tx.$queryRawUnsafe<Array<{ id: string; version: number; closedAt: Date | null }>>(
        `UPDATE crm_conversation_states SET status=$2,snoozed_until=$3,
           closed_at=CASE WHEN $2='CLOSED' THEN NOW() ELSE NULL END,
           closed_by_user_id=CASE WHEN $2='CLOSED' THEN $4::text ELSE NULL END,
           updated_by_user_id=$4::text,version=version+1,updated_at=NOW()
         WHERE id=$1::text RETURNING id,version,closed_at AS "closedAt"`,
        current[0].id, status, status === 'SNOOZED' ? snoozedUntil : null, actorUserId,
      );
      return { subjectType, subjectId, status, snoozedUntil: status === 'SNOOZED' ? snoozedUntil : null,
        closedAt: rows[0].closedAt, id: rows[0].id, version: rows[0].version };
    });
  }

  private subjectColumn(type: SubjectType) {
    if (type === 'CUSTOMER') return 'customer_id';
    if (type === 'LEAD') return 'lead_id';
    return 'opportunity_id';
  }

  private subjectValues(type: SubjectType, id: string) {
    return { customerId: type === 'CUSTOMER' ? id : null, leadId: type === 'LEAD' ? id : null,
      opportunityId: type === 'OPPORTUNITY' ? id : null };
  }

  private async assertAssignableUser(scope: Scope, userId: string, tx: Prisma.TransactionClient | PrismaService = this.prisma) {
    const rows = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT u.id FROM users u JOIN memberships m ON m."userId"=u.id
       JOIN roles r ON r.id=m."roleId" AND r."tenantId"=m."tenantId"
       WHERE u.id=$1::text AND m."tenantId"=$2::text AND m."companyId"=$3::text AND m.status='ACTIVE'
         AND (r.scope<>'BRANCH' OR EXISTS(SELECT 1 FROM membership_branch_access mba WHERE mba."membershipId"=m.id AND mba."branchId"=$4::text)) LIMIT 1`,
      userId, scope.tenantId, scope.companyId, scope.branchId,
    );
    if (!rows[0]) throw new BadRequestException('Conversation assignee is not an active branch member.');
  }

  private async assertSubject(scope: Scope, type: SubjectType, id: string) {
    const rows = type === 'CUSTOMER'
      ? await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
          `SELECT id FROM customers WHERE id=$4::text AND "tenantId"=$1::text AND "branchId"=$3::text LIMIT 1`, scope.tenantId, scope.companyId, scope.branchId, id)
      : type === 'LEAD'
        ? await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
            `SELECT id FROM crm_leads WHERE id=$4::text AND tenant_id=$1::text AND company_id=$2::text AND branch_id=$3::text LIMIT 1`, scope.tenantId, scope.companyId, scope.branchId, id)
        : await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
            `SELECT id FROM crm_opportunities WHERE id=$4::text AND tenant_id=$1::text AND company_id=$2::text AND branch_id=$3::text LIMIT 1`, scope.tenantId, scope.companyId, scope.branchId, id);
    if (!rows[0]) throw new NotFoundException('Conversation subject not found in active branch.');
  }
}
