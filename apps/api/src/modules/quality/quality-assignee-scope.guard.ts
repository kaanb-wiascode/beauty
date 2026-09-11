import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import type { JwtPayload } from '../../common/auth/jwt.strategy';

@Injectable()
export class QualityAssigneeScopeGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      user?: JwtPayload;
      body?: { assignedUserId?: string | null; branchId?: string | null };
      params?: { id?: string };
      route?: { path?: string };
    }>();

    const assignedUserId = request.body?.assignedUserId ?? null;
    if (!assignedUserId) return true;

    const user = request.user;
    if (!user?.tenantId || !user.companyId) {
      throw new UnauthorizedException('Quality assignment context is missing.');
    }

    let branchId = request.body?.branchId ?? null;

    if (!branchId && request.params?.id) {
      const routePath = request.route?.path ?? '';
      const sourceTable = routePath.includes('feedback/')
        ? 'customer_feedback'
        : 'quality_cases';
      const idColumn = sourceTable === 'customer_feedback' ? 'id' : 'id';
      const rows = await this.prisma.$queryRawUnsafe<Array<{ branchId: string }>>(
        `SELECT branch_id AS "branchId"
         FROM ${sourceTable}
         WHERE ${idColumn}=$1::text
           AND tenant_id=$2::text
           AND company_id=$3::text
         LIMIT 1`,
        request.params.id,
        user.tenantId,
        user.companyId,
      );
      branchId = rows[0]?.branchId ?? null;
    }

    if (!branchId) {
      throw new BadRequestException('Quality branch context is required for assignment.');
    }

    if (user.branchId && user.branchId !== branchId) {
      throw new BadRequestException('Quality assignment is outside active branch scope.');
    }

    const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT m.id
       FROM memberships m
       JOIN roles r ON r.id=m."roleId" AND r."tenantId"=m."tenantId"
       WHERE m."userId"=$1::text
         AND m."tenantId"=$2::text
         AND m."companyId"=$3::text
         AND m.status='ACTIVE'
         AND (r."companyId" IS NULL OR r."companyId"=$3::text)
         AND (
           r.scope='CENTRAL'
           OR EXISTS (
             SELECT 1
             FROM membership_branch_access mba
             WHERE mba."membershipId"=m.id
               AND mba."branchId"=$4::text
           )
         )
       LIMIT 1`,
      assignedUserId,
      user.tenantId,
      user.companyId,
      branchId,
    );

    if (!rows.length) {
      throw new BadRequestException(
        'Assigned user is outside tenant/company/branch scope.',
      );
    }

    return true;
  }
}
