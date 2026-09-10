import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

export interface CreateManagementFinanceActionInput {
  branchId?: string | null;
  sourceCode?: string;
  sourceType?: string;
  title: string;
  description?: string;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  assignedUserId?: string | null;
  dueAt?: Date | null;
}

export interface UpdateManagementFinanceActionInput {
  status?: 'OPEN' | 'IN_PROGRESS' | 'BLOCKED' | 'COMPLETED' | 'CANCELLED';
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  assignedUserId?: string | null;
  dueAt?: Date | null;
  resolutionNote?: string | null;
}

@Injectable()
export class ManagementFinanceActionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  private context() {
    return {
      tenantId: this.tenantContext.getTenantId(),
      companyId: this.tenantContext.getCompanyId(),
      branchId: this.tenantContext.getBranchId(),
    };
  }

  private async validateBranch(branchId: string | null | undefined) {
    if (!branchId) return null;
    const { companyId, branchId: scopedBranchId } = this.context();
    if (scopedBranchId && scopedBranchId !== branchId) {
      throw new BadRequestException('Branch is outside the active tenant scope.');
    }
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id FROM branches WHERE id=$1::text AND "companyId"=$2::text AND status='ACTIVE' LIMIT 1`,
      branchId,
      companyId,
    );
    if (!rows.length) throw new BadRequestException('Branch not found in company.');
    return branchId;
  }

  private async validateAssignee(userId: string | null | undefined) {
    if (!userId) return null;
    const { tenantId, companyId } = this.context();
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT m."userId" FROM memberships m
       WHERE m."userId"=$1::text AND m."tenantId"=$2::text
         AND (m."companyId" IS NULL OR m."companyId"=$3::text)
         AND m.status='ACTIVE' LIMIT 1`,
      userId,
      tenantId,
      companyId,
    );
    if (!rows.length) throw new BadRequestException('Assigned user has no active membership in scope.');
    return userId;
  }

  async create(input: CreateManagementFinanceActionInput) {
    const { tenantId, companyId, branchId: scopedBranchId } = this.context();
    const branchId = await this.validateBranch(input.branchId ?? scopedBranchId);
    const assignedUserId = await this.validateAssignee(input.assignedUserId);
    const title = input.title.trim();
    if (!title) throw new BadRequestException('Title is required.');

    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `INSERT INTO management_finance_actions(
         id,tenant_id,company_id,branch_id,source_code,source_type,title,description,
         priority,status,assigned_user_id,due_at,created_at,updated_at
       ) VALUES($1::text,$2::text,$3::text,$4::text,$5,$6,$7,$8,$9,'OPEN',$10::text,$11::timestamptz,NOW(),NOW())
       RETURNING *`,
      randomUUID(), tenantId, companyId, branchId, input.sourceCode ?? null,
      input.sourceType ?? null, title, input.description ?? null,
      input.priority ?? 'MEDIUM', assignedUserId, input.dueAt ?? null,
    );
    return this.map(rows[0]);
  }

  async list(status?: string, limit = 100) {
    const { companyId, branchId } = this.context();
    const safeLimit = Math.max(1, Math.min(500, Math.floor(limit)));
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT a.*,u.email AS assigned_user_email,u."firstName" AS assigned_user_first_name,u."lastName" AS assigned_user_last_name
       FROM management_finance_actions a
       LEFT JOIN users u ON u.id=a.assigned_user_id
       WHERE a.company_id=$1::text
         AND ($2::text IS NULL OR a.branch_id=$2::text)
         AND ($3::text IS NULL OR a.status=$3::text)
       ORDER BY
         CASE a.priority WHEN 'CRITICAL' THEN 4 WHEN 'HIGH' THEN 3 WHEN 'MEDIUM' THEN 2 ELSE 1 END DESC,
         a.due_at NULLS LAST,a.created_at DESC
       LIMIT $4`,
      companyId, branchId, status ?? null, safeLimit,
    );
    return rows.map((row) => this.map(row));
  }

  async update(id: string, input: UpdateManagementFinanceActionInput) {
    const { companyId, branchId } = this.context();
    const currentRows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM management_finance_actions
       WHERE id=$1::text AND company_id=$2::text AND ($3::text IS NULL OR branch_id=$3::text) LIMIT 1`,
      id, companyId, branchId,
    );
    const current = currentRows[0];
    if (!current) throw new NotFoundException('Management action not found.');

    const assignedUserId = input.assignedUserId === undefined
      ? current.assigned_user_id
      : await this.validateAssignee(input.assignedUserId);
    const status = input.status ?? current.status;
    const completedAt = status === 'COMPLETED' ? current.completed_at ?? new Date() : null;

    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `UPDATE management_finance_actions SET
         status=$2::text,
         priority=$3::text,
         assigned_user_id=$4::text,
         due_at=$5::timestamptz,
         resolution_note=$6,
         completed_at=$7::timestamptz,
         updated_at=NOW()
       WHERE id=$1::text
       RETURNING *`,
      id,
      status,
      input.priority ?? current.priority,
      assignedUserId,
      input.dueAt === undefined ? current.due_at : input.dueAt,
      input.resolutionNote === undefined ? current.resolution_note : input.resolutionNote,
      completedAt,
    );
    return this.map(rows[0]);
  }

  async summary() {
    const { companyId, branchId } = this.context();
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT status,priority,COUNT(*)::int AS count,
              COUNT(*) FILTER (WHERE due_at<NOW() AND status NOT IN ('COMPLETED','CANCELLED'))::int AS overdue
       FROM management_finance_actions
       WHERE company_id=$1::text AND ($2::text IS NULL OR branch_id=$2::text)
       GROUP BY status,priority`,
      companyId, branchId,
    );
    const openStatuses = new Set(['OPEN','IN_PROGRESS','BLOCKED']);
    return {
      total: rows.reduce((sum, row) => sum + Number(row.count), 0),
      open: rows.filter((row) => openStatuses.has(row.status)).reduce((sum, row) => sum + Number(row.count), 0),
      overdue: rows.reduce((sum, row) => sum + Number(row.overdue), 0),
      criticalOpen: rows.filter((row) => openStatuses.has(row.status) && row.priority === 'CRITICAL').reduce((sum, row) => sum + Number(row.count), 0),
      breakdown: rows.map((row) => ({ status: row.status, priority: row.priority, count: Number(row.count), overdue: Number(row.overdue) })),
    };
  }

  private map(row: any) {
    return {
      id: row.id,
      branchId: row.branch_id,
      sourceCode: row.source_code,
      sourceType: row.source_type,
      title: row.title,
      description: row.description,
      priority: row.priority,
      status: row.status,
      assignedUserId: row.assigned_user_id,
      assignedUser: row.assigned_user_email ? {
        email: row.assigned_user_email,
        firstName: row.assigned_user_first_name,
        lastName: row.assigned_user_last_name,
      } : null,
      dueAt: row.due_at,
      completedAt: row.completed_at,
      resolutionNote: row.resolution_note,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
