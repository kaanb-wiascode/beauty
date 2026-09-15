import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';

import { TenantContext } from '../../common/tenant/tenant-context';
import { PlatformAuditService } from '../platform-audit/platform-audit.service';

type TemplateDefinition = {
  key: string;
  name: string;
  description: string;
  scope: 'CENTRAL' | 'COMPANY' | 'BRANCH';
  permissions: string[];
};

const TEMPLATES: TemplateDefinition[] = [
  { key: 'general-manager', name: 'General Manager', description: 'Company-wide operational administration.', scope: 'CENTRAL', permissions: ['reports.read','customers.read','appointments.read','payments.read','staff.read','services.read','inventory.read','crm.read','finance.read','accounting.read','hr.read'] },
  { key: 'branch-manager', name: 'Branch Manager', description: 'Branch operations, staff and commercial management.', scope: 'BRANCH', permissions: ['customers.read','customers.create','customers.update','appointments.read','appointments.create','appointments.update','payments.read','payments.create','reports.read','staff.read','staff.update','services.read','inventory.read','inventory.write','crm.read','crm.manage'] },
  { key: 'reception', name: 'Reception', description: 'Front desk customer and appointment operations.', scope: 'BRANCH', permissions: ['customers.read','customers.create','customers.update','appointments.read','appointments.create','appointments.update','appointments.cancel','payments.read','payments.create','services.read'] },
  { key: 'finance', name: 'Finance', description: 'Finance and accounting operations.', scope: 'COMPANY', permissions: ['finance.read','finance.manage','accounting.read','accounting.manage','payments.read','reports.read','financial_integrations.read'] },
  { key: 'accountant', name: 'Accountant', description: 'Accounting and reporting access.', scope: 'COMPANY', permissions: ['accounting.read','accounting.manage','finance.read','payments.read','reports.read'] },
  { key: 'hr', name: 'HR', description: 'Human resources administration.', scope: 'COMPANY', permissions: ['hr.read','hr.manage','staff.read','reports.read'] },
  { key: 'warehouse', name: 'Warehouse', description: 'Inventory and warehouse operations.', scope: 'BRANCH', permissions: ['inventory.read','inventory.write','reports.read'] },
  { key: 'auditor', name: 'Auditor', description: 'Read-oriented audit and reporting access.', scope: 'COMPANY', permissions: ['reports.read','finance.read','accounting.read','payments.read','inventory.read','hr.read'] },
];

@Injectable()
export class RoleTemplateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
    private readonly audit: PlatformAuditService,
  ) {}

  list() {
    return TEMPLATES.map((template) => ({ ...template, permissionCount: template.permissions.length }));
  }

  async instantiate(templateKey: string, input: { name?: string; description?: string }) {
    const context = this.tenantContext.getContext();
    const template = TEMPLATES.find((item) => item.key === templateKey);
    if (!template) throw new NotFoundException('Role template not found');

    const name = input.name?.trim() || template.name;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    if (!slug) throw new BadRequestException('Invalid role name');

    const duplicate = await this.prisma.role.findFirst({
      where: { tenantId: context.tenantId, OR: [{ slug }, { companyId: context.companyId, name }] },
      select: { id: true },
    });
    if (duplicate) throw new BadRequestException('Role name or slug already exists');

    const actor = await this.prisma.membership.findFirst({
      where: { id: context.membershipId, tenantId: context.tenantId, companyId: context.companyId, status: 'ACTIVE' },
      select: { userId: true },
    });
    if (!actor) throw new BadRequestException('Active administrator membership is required');

    const permissionPairs = template.permissions.map((value) => {
      const [resource, action] = value.split('.');
      return { resource, action };
    });
    const permissions = await this.prisma.permission.findMany({
      where: { OR: permissionPairs },
      select: { id: true, resource: true, action: true },
    });

    return this.prisma.$transaction(async (tx) => {
      const role = await tx.role.create({
        data: {
          tenantId: context.tenantId,
          companyId: context.companyId,
          name,
          slug,
          description: input.description?.trim() || template.description,
          scope: template.scope,
        },
      });
      if (permissions.length) {
        await tx.rolePermission.createMany({
          data: permissions.map((permission) => ({ roleId: role.id, permissionId: permission.id })),
          skipDuplicates: true,
        });
      }
      await this.audit.record({
        actorUserId: actor.userId,
        resource: 'roles',
        action: 'template.instantiate',
        targetTenantId: context.tenantId,
        targetEntityType: 'role',
        targetEntityId: role.id,
        beforeState: null,
        afterState: {
          templateKey,
          name: role.name,
          slug: role.slug,
          scope: role.scope,
          permissionCount: permissions.length,
        },
        metadata: { companyId: context.companyId, actorMembershipId: context.membershipId },
      }, tx);
      return tx.role.findUnique({
        where: { id: role.id },
        include: { rolePermissions: { include: { permission: true } }, _count: { select: { memberships: true, rolePermissions: true } } },
      });
    });
  }
}
