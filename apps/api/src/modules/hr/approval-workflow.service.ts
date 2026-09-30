import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

type ApprovalActor = { userId: string; roleId: string };

type ApproverType =
  | 'ROLE'
  | 'MANAGER'
  | 'DIRECT_MANAGER'
  | 'BRANCH_MANAGER'
  | 'REGIONAL_MANAGER'
  | 'DEPARTMENT_MANAGER'
  | 'ORGANIZATION_MANAGER'
  | 'PERMISSION'
  | 'USER';

const APPROVER_TYPES = new Set<ApproverType>([
  'ROLE',
  'MANAGER',
  'DIRECT_MANAGER',
  'BRANCH_MANAGER',
  'REGIONAL_MANAGER',
  'DEPARTMENT_MANAGER',
  'ORGANIZATION_MANAGER',
  'PERMISSION',
  'USER',
]);

const NO_VALUE_TYPES = new Set<ApproverType>([
  'MANAGER',
  'DIRECT_MANAGER',
  'BRANCH_MANAGER',
  'REGIONAL_MANAGER',
  'DEPARTMENT_MANAGER',
]);

@Injectable()
export class ApprovalWorkflowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: TenantContext,
  ) {}

  private scope() {
    const tenantId = this.ctx.getTenantId();
    const companyId = this.ctx.getCompanyId();
    if (!tenantId || !companyId) {
      throw new BadRequestException('Şirket oturumu bulunamadı. Lütfen yeniden giriş yapın.');
    }
    return { tenantId, companyId };
  }

  async policies(entityType?: string) {
    const { tenantId, companyId } = this.scope();
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT p.*,
        COALESCE(
          json_agg(
            json_build_object(
              'id',s.id,
              'order',s.step_order,
              'approverType',s.approver_type,
              'approverValue',s.approver_value,
              'required',s.required,
              'slaMinutes',s.sla_minutes,
              'escalationApproverType',s.escalation_approver_type,
              'escalationApproverValue',s.escalation_approver_value,
              'timeoutAction',s.timeout_action
            )
            ORDER BY s.step_order
          ) FILTER(WHERE s.id IS NOT NULL),
          '[]'
        ) AS steps
       FROM hr_approval_policies p
       LEFT JOIN hr_approval_policy_steps s ON s.policy_id=p.id
       WHERE p.tenant_id=$1
         AND p.company_id=$2
         AND ($3::text IS NULL OR p.entity_type=$3)
       GROUP BY p.id
       ORDER BY p.active DESC,p.name`,
      tenantId,
      companyId,
      entityType ?? null,
    );
  }

  async createPolicy(body: any) {
    const { tenantId, companyId } = this.scope();
    const name = String(body.name ?? '').trim();
    const entity = String(body.entityType ?? '').trim().toUpperCase();
    const steps = Array.isArray(body.steps) ? body.steps : [];

    if (!name || !entity || !steps.length) {
      throw new BadRequestException('Onay akışı adı, işlem türü ve en az bir onay adımı zorunludur.');
    }

    return this.prisma.$transaction(async (tx) => {
      const id = randomUUID();
      await tx.$executeRawUnsafe(
        `INSERT INTO hr_approval_policies(
          id,tenant_id,company_id,name,entity_type,branch_id,min_amount,max_amount
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
        id,
        tenantId,
        companyId,
        name,
        entity,
        body.branchId ?? null,
        body.minAmount ?? null,
        body.maxAmount ?? null,
      );

      for (let index = 0; index < steps.length; index += 1) {
        const rawType = String(steps[index].approverType ?? '').toUpperCase() as ApproverType;
        if (!APPROVER_TYPES.has(rawType)) {
          throw new BadRequestException('Geçersiz onaylayan tipi.');
        }

        const approverValue = String(steps[index].approverValue ?? '').trim() || null;
        if (!NO_VALUE_TYPES.has(rawType) && !approverValue) {
          throw new BadRequestException(`${rawType} için onaylayan değeri zorunludur.`);
        }

        if (rawType === 'ORGANIZATION_MANAGER') {
          const level = Number(approverValue);
          if (!Number.isInteger(level) || level < 1 || level > 10) {
            throw new BadRequestException('Organizasyon yönetici seviyesi 1 ile 10 arasında olmalıdır.');
          }
        }

        const slaMinutes =
          steps[index].slaMinutes == null || steps[index].slaMinutes === ''
            ? null
            : Number(steps[index].slaMinutes);
        if (slaMinutes != null && (!Number.isInteger(slaMinutes) || slaMinutes < 1)) {
          throw new BadRequestException('SLA süresi dakika cinsinden 1 veya daha büyük olmalıdır.');
        }

        const escalationApproverType = steps[index].escalationApproverType
          ? String(steps[index].escalationApproverType).toUpperCase()
          : null;
        if (
          escalationApproverType &&
          !APPROVER_TYPES.has(escalationApproverType as ApproverType)
        ) {
          throw new BadRequestException('Geçersiz süre aşımı onaylayan tipi.');
        }

        const escalationApproverValue =
          String(steps[index].escalationApproverValue ?? '').trim() || null;
        const timeoutAction = String(steps[index].timeoutAction ?? 'ESCALATE').toUpperCase();
        if (!['ESCALATE', 'AUTO_APPROVE', 'AUTO_REJECT', 'NOTIFY'].includes(timeoutAction)) {
          throw new BadRequestException('Geçersiz süre aşımı davranışı.');
        }

        await tx.$executeRawUnsafe(
          `INSERT INTO hr_approval_policy_steps(
            id,policy_id,step_order,approver_type,approver_value,required,
            escalation_hours,sla_minutes,escalation_approver_type,
            escalation_approver_value,timeout_action
          ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          randomUUID(),
          id,
          index + 1,
          rawType,
          approverValue,
          steps[index].required !== false,
          null,
          slaMinutes,
          escalationApproverType,
          escalationApproverValue,
          timeoutAction,
        );
      }

      return { id };
    });
  }

  async submit(body: any) {
    const { tenantId, companyId } = this.scope();
    const entity = String(body.entityType ?? '').trim().toUpperCase();
    const entityId = String(body.entityId ?? '').trim();

    if (!entity || !entityId) {
      throw new BadRequestException('İşlem türü ve işlem kaydı zorunludur.');
    }

    const amount = body.amount == null ? null : Number(body.amount);
    const policies = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT p.*
       FROM hr_approval_policies p
       WHERE p.tenant_id=$1
         AND p.company_id=$2
         AND p.entity_type=$3
         AND p.active=TRUE
         AND (p.branch_id IS NULL OR p.branch_id=$4)
         AND (p.min_amount IS NULL OR ($5::numeric IS NOT NULL AND $5::numeric>=p.min_amount))
         AND (p.max_amount IS NULL OR ($5::numeric IS NOT NULL AND $5::numeric<=p.max_amount))
       ORDER BY (p.branch_id IS NOT NULL)::int DESC,p.min_amount DESC NULLS LAST
       LIMIT 1`,
      tenantId,
      companyId,
      entity,
      body.branchId ?? null,
      amount,
    );

    if (!policies.length) {
      throw new NotFoundException('Bu işlem için aktif bir onay politikası bulunamadı.');
    }

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.$queryRawUnsafe<any[]>(
        `SELECT id,status,current_step AS "currentStep"
         FROM hr_approval_instances
         WHERE tenant_id=$1 AND entity_type=$2 AND entity_id=$3`,
        tenantId,
        entity,
        entityId,
      );
      if (existing.length) return { ...existing[0], idempotent: true };

      const id = randomUUID();
      await tx.$executeRawUnsafe(
        `INSERT INTO hr_approval_instances(
          id,tenant_id,company_id,branch_id,policy_id,entity_type,entity_id,
          requester_id,amount,step_started_at
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,CURRENT_TIMESTAMP)`,
        id,
        tenantId,
        companyId,
        body.branchId ?? null,
        policies[0].id,
        entity,
        entityId,
        body.requesterId ?? null,
        amount,
      );

      await tx.$executeRawUnsafe(
        `INSERT INTO hr_approval_actions(
          id,tenant_id,instance_id,step_order,action,actor_id,comment
        ) VALUES($1,$2,$3,0,'SUBMIT',$4,$5)`,
        randomUUID(),
        tenantId,
        id,
        body.requesterId ?? null,
        body.comment ?? null,
      );

      return { id, status: 'PENDING', currentStep: 1 };
    });
  }

  private async directManagerAuthorized(
    tx: Prisma.TransactionClient,
    instance: any,
    actorUserId: string,
  ) {
    if (!instance.requester_id) return false;
    const rows = await tx.$queryRawUnsafe<any[]>(
      `SELECT 1
       FROM hr_employee_user_links requester
       JOIN hr_employee_assignments a
         ON a.staff_id=requester.staff_id
        AND a.tenant_id=requester.tenant_id
        AND a.effective_from<=CURRENT_DATE
        AND (a.effective_to IS NULL OR a.effective_to>=CURRENT_DATE)
       JOIN hr_employee_user_links manager
         ON manager.staff_id=a.manager_staff_id
        AND manager.tenant_id=a.tenant_id
        AND manager.active=TRUE
       WHERE requester.user_id=$1
         AND requester.tenant_id=$2
         AND requester.active=TRUE
         AND manager.user_id=$3
       LIMIT 1`,
      instance.requester_id,
      instance.tenant_id,
      actorUserId,
    );
    return rows.length > 0;
  }

  private async organizationManagerAuthorized(
    tx: Prisma.TransactionClient,
    instance: any,
    actorUserId: string,
    levelValue: string | null,
  ) {
    if (!instance.requester_id) return false;
    const level = Number(levelValue);
    if (!Number.isInteger(level) || level < 1 || level > 10) return false;

    const rows = await tx.$queryRawUnsafe<any[]>(
      `WITH RECURSIVE manager_chain AS (
         SELECT a.manager_staff_id AS staff_id,1 AS depth
         FROM hr_employee_user_links requester
         JOIN hr_employee_assignments a
           ON a.staff_id=requester.staff_id
          AND a.tenant_id=requester.tenant_id
          AND a.effective_from<=CURRENT_DATE
          AND (a.effective_to IS NULL OR a.effective_to>=CURRENT_DATE)
         WHERE requester.user_id=$1
           AND requester.tenant_id=$2
           AND requester.active=TRUE

         UNION ALL

         SELECT next_assignment.manager_staff_id,manager_chain.depth+1
         FROM manager_chain
         JOIN hr_employee_assignments next_assignment
           ON next_assignment.staff_id=manager_chain.staff_id
          AND next_assignment.tenant_id=$2
          AND next_assignment.effective_from<=CURRENT_DATE
          AND (next_assignment.effective_to IS NULL OR next_assignment.effective_to>=CURRENT_DATE)
         WHERE manager_chain.staff_id IS NOT NULL
           AND manager_chain.depth<$3
       )
       SELECT 1
       FROM manager_chain
       JOIN hr_employee_user_links manager
         ON manager.staff_id=manager_chain.staff_id
        AND manager.tenant_id=$2
        AND manager.active=TRUE
       WHERE manager_chain.depth=$3
         AND manager.user_id=$4
       LIMIT 1`,
      instance.requester_id,
      instance.tenant_id,
      level,
      actorUserId,
    );
    return rows.length > 0;
  }

  private async roleHierarchyAuthorized(
    tx: Prisma.TransactionClient,
    instance: any,
    actorUserId: string,
    roleSlug: string,
    requireSameDepartment = false,
  ) {
    const rows = await tx.$queryRawUnsafe<any[]>(
      `SELECT 1
       FROM memberships m
       JOIN roles r ON r.id=m."roleId"
       LEFT JOIN membership_branch_access mba ON mba."membershipId"=m.id
       WHERE m."userId"=$1
         AND m."tenantId"=$2
         AND m."companyId"=$3
         AND m.status='ACTIVE'
         AND r.slug=$4
         AND (
           $5::text IS NULL
           OR r.scope='CENTRAL'
           OR mba."branchId"=$5
         )
       LIMIT 1`,
      actorUserId,
      instance.tenant_id,
      instance.company_id,
      roleSlug,
      instance.branch_id ?? null,
    );
    if (!rows.length) return false;
    if (!requireSameDepartment || !instance.requester_id) return true;

    const departmentRows = await tx.$queryRawUnsafe<any[]>(
      `SELECT 1
       FROM hr_employee_user_links requester_link
       JOIN hr_employee_assignments requester_assignment
         ON requester_assignment.staff_id=requester_link.staff_id
        AND requester_assignment.tenant_id=requester_link.tenant_id
        AND requester_assignment.effective_from<=CURRENT_DATE
        AND (requester_assignment.effective_to IS NULL OR requester_assignment.effective_to>=CURRENT_DATE)
       JOIN hr_employee_user_links actor_link
         ON actor_link.user_id=$1
        AND actor_link.tenant_id=requester_link.tenant_id
        AND actor_link.active=TRUE
       JOIN hr_employee_assignments actor_assignment
         ON actor_assignment.staff_id=actor_link.staff_id
        AND actor_assignment.tenant_id=actor_link.tenant_id
        AND actor_assignment.effective_from<=CURRENT_DATE
        AND (actor_assignment.effective_to IS NULL OR actor_assignment.effective_to>=CURRENT_DATE)
       WHERE requester_link.user_id=$2
         AND requester_link.tenant_id=$3
         AND requester_link.active=TRUE
         AND requester_assignment.department_id IS NOT NULL
         AND actor_assignment.department_id=requester_assignment.department_id
       LIMIT 1`,
      actorUserId,
      instance.requester_id,
      instance.tenant_id,
    );
    return departmentRows.length > 0;
  }

  private async authorizedByType(
    tx: Prisma.TransactionClient,
    instance: any,
    actor: ApprovalActor,
    approverType: string,
    approverValue: string | null,
  ) {
    if (approverType === 'USER') return approverValue === actor.userId;
    if (approverType === 'ROLE') return approverValue === actor.roleId;

    if (approverType === 'PERMISSION') {
      const [resource, action] = String(approverValue ?? '').split(':');
      if (!resource || !action) return false;
      const rows = await tx.$queryRawUnsafe<any[]>(
        `SELECT 1
         FROM role_permissions rp
         JOIN permissions p ON p.id=rp."permissionId"
         WHERE rp."roleId"=$1 AND p.resource=$2 AND p.action=$3
         LIMIT 1`,
        actor.roleId,
        resource,
        action,
      );
      return rows.length > 0;
    }

    if (approverType === 'MANAGER' || approverType === 'DIRECT_MANAGER') {
      return this.directManagerAuthorized(tx, instance, actor.userId);
    }

    if (approverType === 'ORGANIZATION_MANAGER') {
      return this.organizationManagerAuthorized(tx, instance, actor.userId, approverValue);
    }

    if (approverType === 'BRANCH_MANAGER') {
      return this.roleHierarchyAuthorized(tx, instance, actor.userId, 'branch-manager');
    }

    if (approverType === 'REGIONAL_MANAGER') {
      return this.roleHierarchyAuthorized(tx, instance, actor.userId, 'regional-manager');
    }

    if (approverType === 'DEPARTMENT_MANAGER') {
      return this.roleHierarchyAuthorized(
        tx,
        instance,
        actor.userId,
        'department-manager',
        true,
      );
    }

    return false;
  }

  private async authorized(
    tx: Prisma.TransactionClient,
    instance: any,
    actor: ApprovalActor,
  ) {
    const step = (
      await tx.$queryRawUnsafe<any[]>(
        `SELECT approver_type,approver_value,sla_minutes,
                escalation_approver_type,escalation_approver_value,timeout_action
         FROM hr_approval_policy_steps
         WHERE policy_id=$1 AND step_order=$2`,
        instance.policy_id,
        Number(instance.current_step),
      )
    )[0];
    if (!step) return false;

    const delegated = await tx.$queryRawUnsafe<any[]>(
      `SELECT delegate_to
       FROM hr_approval_actions
       WHERE instance_id=$1 AND step_order=$2 AND action='DELEGATE'
       ORDER BY created_at DESC
       LIMIT 1`,
      instance.id,
      Number(instance.current_step),
    );
    if (delegated[0]?.delegate_to === actor.userId) return true;

    const primaryAuthorized = await this.authorizedByType(
      tx,
      instance,
      actor,
      step.approver_type,
      step.approver_value,
    );
    if (primaryAuthorized) return true;

    const slaMinutes = Number(step.sla_minutes ?? 0);
    const startedAt = new Date(instance.step_started_at).getTime();
    const overdue = slaMinutes > 0 && Date.now() >= startedAt + slaMinutes * 60_000;

    if (
      overdue &&
      step.timeout_action === 'ESCALATE' &&
      step.escalation_approver_type
    ) {
      return this.authorizedByType(
        tx,
        instance,
        actor,
        step.escalation_approver_type,
        step.escalation_approver_value,
      );
    }

    return false;
  }

  async act(
    id: string,
    action: string,
    actor: ApprovalActor,
    comment?: string,
    delegateTo?: string,
  ) {
    const normalizedAction = String(action).toUpperCase();
    if (
      !['APPROVE', 'REJECT', 'RETURN', 'DELEGATE', 'ESCALATE', 'CANCEL'].includes(
        normalizedAction,
      )
    ) {
      throw new BadRequestException('Geçersiz onay işlemi.');
    }

    const normalizedComment = String(comment ?? '').trim();
    if (['REJECT', 'RETURN'].includes(normalizedAction) && !normalizedComment) {
      throw new BadRequestException(
        normalizedAction === 'REJECT'
          ? 'Ret nedeni zorunludur.'
          : 'Düzeltmeye gönderme nedeni zorunludur.',
      );
    }

    if (normalizedAction === 'DELEGATE' && !delegateTo) {
      throw new BadRequestException('Delegasyon yapılacak kullanıcı zorunludur.');
    }

    const { tenantId, companyId } = this.scope();

    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRawUnsafe<any[]>(
        `SELECT i.*,
          (SELECT max(step_order) FROM hr_approval_policy_steps WHERE policy_id=i.policy_id) AS max_step
         FROM hr_approval_instances i
         WHERE i.id=$1 AND i.tenant_id=$2 AND i.company_id=$3
         FOR UPDATE`,
        id,
        tenantId,
        companyId,
      );
      if (!rows.length) throw new NotFoundException('Onay kaydı bulunamadı.');

      const instance = rows[0];
      if (
        !['PENDING', 'RETURNED'].includes(instance.status) &&
        normalizedAction !== 'CANCEL'
      ) {
        throw new ConflictException('Onay süreci daha önce tamamlanmış.');
      }

      if (normalizedAction === 'CANCEL') {
        if (instance.requester_id !== actor.userId) {
          throw new ForbiddenException('Bu onay sürecini yalnız talep sahibi iptal edebilir.');
        }
      } else if (!(await this.authorized(tx, instance, actor))) {
        throw new ForbiddenException('Bu onay adımı için yetkiniz bulunmuyor.');
      }

      let status = instance.status === 'RETURNED' ? 'PENDING' : instance.status;
      let step = Number(instance.current_step);
      let resetStepTimer = false;

      if (normalizedAction === 'APPROVE') {
        if (step >= Number(instance.max_step)) {
          status = 'APPROVED';
        } else {
          step += 1;
          resetStepTimer = true;
        }
      } else if (normalizedAction === 'REJECT') {
        status = 'REJECTED';
      } else if (normalizedAction === 'RETURN') {
        status = 'RETURNED';
      } else if (normalizedAction === 'CANCEL') {
        status = 'CANCELLED';
      }

      await tx.$executeRawUnsafe(
        `INSERT INTO hr_approval_actions(
          id,tenant_id,instance_id,step_order,action,actor_id,delegate_to,comment
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
        randomUUID(),
        tenantId,
        id,
        Number(instance.current_step),
        normalizedAction,
        actor.userId,
        delegateTo ?? null,
        normalizedComment || null,
      );

      await tx.$executeRawUnsafe(
        `UPDATE hr_approval_instances
         SET status=$1,
             current_step=$2,
             step_started_at=CASE WHEN $3 THEN CURRENT_TIMESTAMP ELSE step_started_at END,
             updated_at=CURRENT_TIMESTAMP,
             completed_at=CASE
               WHEN $1 IN('APPROVED','REJECTED','CANCELLED') THEN CURRENT_TIMESTAMP
               ELSE NULL
             END
         WHERE id=$4`,
        status,
        step,
        resetStepTimer,
        id,
      );

      return { id, status, currentStep: step };
    });
  }

  async resubmit(id: string, actorUserId: string, comment?: string) {
    const { tenantId, companyId } = this.scope();
    const normalizedComment = String(comment ?? '').trim();
    if (!normalizedComment) {
      throw new BadRequestException('Düzeltme açıklaması zorunludur.');
    }

    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRawUnsafe<any[]>(
        `SELECT *
         FROM hr_approval_instances
         WHERE id=$1 AND tenant_id=$2 AND company_id=$3
         FOR UPDATE`,
        id,
        tenantId,
        companyId,
      );
      const instance = rows[0];
      if (!instance) throw new NotFoundException('Onay kaydı bulunamadı.');
      if (instance.requester_id !== actorUserId) {
        throw new ForbiddenException('Düzeltme sonrası yeniden göndermeyi yalnız talep sahibi yapabilir.');
      }
      if (instance.status !== 'RETURNED') {
        throw new ConflictException('Yalnız düzeltmeye gönderilmiş kayıt yeniden gönderilebilir.');
      }

      await tx.$executeRawUnsafe(
        `INSERT INTO hr_approval_actions(
          id,tenant_id,instance_id,step_order,action,actor_id,comment
        ) VALUES($1,$2,$3,$4,'SUBMIT',$5,$6)`,
        randomUUID(),
        tenantId,
        id,
        Number(instance.current_step),
        actorUserId,
        normalizedComment,
      );

      await tx.$executeRawUnsafe(
        `UPDATE hr_approval_instances
         SET status='PENDING',
             step_started_at=CURRENT_TIMESTAMP,
             updated_at=CURRENT_TIMESTAMP,
             completed_at=NULL
         WHERE id=$1`,
        id,
      );

      return {
        id,
        status: 'PENDING',
        currentStep: Number(instance.current_step),
      };
    });
  }

  async queue(status = 'PENDING') {
    const { tenantId, companyId } = this.scope();
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT i.id,
              i.entity_type AS "entityType",
              i.entity_id AS "entityId",
              i.status,
              i.current_step AS "currentStep",
              i.amount::text,
              i.created_at AS "createdAt",
              i.step_started_at AS "stepStartedAt",
              p.name AS "policyName",
              s.approver_type AS "approverType",
              s.approver_value AS "approverValue",
              s.sla_minutes AS "slaMinutes",
              s.timeout_action AS "timeoutAction",
              s.escalation_approver_type AS "escalationApproverType",
              s.escalation_approver_value AS "escalationApproverValue",
              CASE
                WHEN s.sla_minutes IS NULL THEN NULL
                ELSE i.step_started_at + (s.sla_minutes * INTERVAL '1 minute')
              END AS "dueAt",
              CASE
                WHEN s.sla_minutes IS NULL THEN FALSE
                ELSE CURRENT_TIMESTAMP >= i.step_started_at + (s.sla_minutes * INTERVAL '1 minute')
              END AS overdue
       FROM hr_approval_instances i
       JOIN hr_approval_policies p ON p.id=i.policy_id
       LEFT JOIN hr_approval_policy_steps s
         ON s.policy_id=i.policy_id
        AND s.step_order=i.current_step
       WHERE i.tenant_id=$1
         AND i.company_id=$2
         AND i.status=$3
       ORDER BY overdue DESC,i.created_at`,
      tenantId,
      companyId,
      status,
    );
  }

  async history(id: string) {
    const { tenantId } = this.scope();
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT step_order AS "step",
              action,
              actor_id AS "actorId",
              delegate_to AS "delegateTo",
              comment,
              created_at AS "createdAt"
       FROM hr_approval_actions
       WHERE tenant_id=$1 AND instance_id=$2
       ORDER BY created_at,id`,
      tenantId,
      id,
    );
  }
}
