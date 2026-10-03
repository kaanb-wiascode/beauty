import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { OrganizationScopeService } from '../../common/tenant/organization-scope.service';
import { TenantContext } from '../../common/tenant/tenant-context';

@Injectable()
export class EmployeeAssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: TenantContext,
    private readonly organizationScope: OrganizationScopeService,
  ) {}

  private scope() {
    const tenantId = this.ctx.getTenantId();
    const companyId = this.ctx.getCompanyId();
    if (!tenantId || !companyId) {
      throw new BadRequestException('Şirket oturumu bulunamadı. Lütfen yeniden giriş yapın.');
    }
    return { tenantId, companyId };
  }

  private async employee(staffId: string) {
    const scope = await this.organizationScope.getBranchScopedWhere();
    const employee = await this.prisma.staff.findFirst({
      where: { id: staffId, ...scope, status: 'ACTIVE' },
      select: { id: true, branchId: true, firstName: true, lastName: true },
    });
    if (!employee) throw new NotFoundException('Çalışan bulunamadı.');
    return employee;
  }

  async list(staffId: string) {
    const employee = await this.employee(staffId);
    const { companyId } = this.scope();

    const [current, history] = await Promise.all([
      this.prisma.$queryRawUnsafe<any[]>(
        `SELECT a.id,a.asset_code AS "assetCode",a.name,a.asset_type AS "assetType",
                a.brand,a.model,a.serial_number AS "serialNumber",a.status,a.condition,
                a.branch_id AS "branchId",b.name AS "branchName",c.name AS "categoryName",
                aa.assigned_at AS "assignedAt",aa.note
         FROM inventory_assets a
         LEFT JOIN branches b ON b.id=a.branch_id
         LEFT JOIN inventory_categories c ON c.id=a.category_id
         LEFT JOIN LATERAL (
           SELECT assigned_at,note
           FROM inventory_asset_assignments
           WHERE asset_id=a.id AND staff_id=$2::text AND returned_at IS NULL
           ORDER BY assigned_at DESC LIMIT 1
         ) aa ON TRUE
         WHERE a.company_id=$1::text AND a.assigned_to_staff_id=$2::text
         ORDER BY a.name`,
        companyId,
        employee.id,
      ),
      this.prisma.$queryRawUnsafe<any[]>(
        `SELECT aa.id,aa.asset_id AS "assetId",a.asset_code AS "assetCode",a.name,
                a.brand,a.model,a.serial_number AS "serialNumber",
                aa.assigned_at AS "assignedAt",aa.returned_at AS "returnedAt",
                aa.note,b.name AS "branchName"
         FROM inventory_asset_assignments aa
         JOIN inventory_assets a ON a.id=aa.asset_id
         LEFT JOIN branches b ON b.id=aa.branch_id
         WHERE a.company_id=$1::text AND aa.staff_id=$2::text
         ORDER BY aa.assigned_at DESC`,
        companyId,
        employee.id,
      ),
    ]);

    return { employee, current, history };
  }

  async available(staffId: string) {
    const employee = await this.employee(staffId);
    const { companyId } = this.scope();

    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT a.id,a.asset_code AS "assetCode",a.name,a.asset_type AS "assetType",
              a.brand,a.model,a.serial_number AS "serialNumber",a.condition,
              a.branch_id AS "branchId",b.name AS "branchName",c.name AS "categoryName"
       FROM inventory_assets a
       LEFT JOIN branches b ON b.id=a.branch_id
       LEFT JOIN inventory_categories c ON c.id=a.category_id
       WHERE a.company_id=$1::text
         AND a.status='ACTIVE'
         AND a.assigned_to_staff_id IS NULL
         AND (a.branch_id=$2::text OR a.branch_id IS NULL)
       ORDER BY a.name,a.asset_code`,
      companyId,
      employee.branchId,
    );
  }

  async assign(staffId: string, assetId: string, note?: string) {
    if (!assetId) throw new BadRequestException('Zimmetlenecek varlığı seçin.');
    const employee = await this.employee(staffId);
    const { tenantId, companyId } = this.scope();

    return this.prisma.$transaction(async (tx) => {
      const assets = await tx.$queryRawUnsafe<any[]>(
        `SELECT id,branch_id AS "branchId",assigned_to_staff_id AS "assignedToStaffId"
         FROM inventory_assets
         WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text
           AND status='ACTIVE'
         LIMIT 1
         FOR UPDATE`,
        assetId,
        tenantId,
        companyId,
      );
      const asset = assets[0];
      if (!asset) throw new NotFoundException('Envanter varlığı bulunamadı.');
      if (asset.assignedToStaffId) {
        throw new BadRequestException('Bu varlık başka bir çalışana zimmetli.');
      }
      if (asset.branchId && asset.branchId !== employee.branchId) {
        throw new BadRequestException('Bu varlık çalışanın şubesinde bulunmuyor.');
      }

      await tx.$executeRawUnsafe(
        `UPDATE inventory_asset_assignments
         SET returned_at=COALESCE(returned_at,NOW())
         WHERE asset_id=$1::text AND returned_at IS NULL`,
        assetId,
      );

      await tx.$executeRawUnsafe(
        `UPDATE inventory_assets
         SET assigned_to_staff_id=$1::text,
             branch_id=COALESCE(branch_id,$2::text),
             updated_at=NOW()
         WHERE id=$3::text`,
        employee.id,
        employee.branchId,
        assetId,
      );

      await tx.$executeRawUnsafe(
        `INSERT INTO inventory_asset_assignments(asset_id,staff_id,branch_id,note)
         VALUES($1::text,$2::text,$3::text,$4)`,
        assetId,
        employee.id,
        employee.branchId,
        note?.trim() || 'Personel zimmeti',
      );

      return { assigned: true, assetId, staffId: employee.id };
    });
  }

  async returnAsset(staffId: string, assetId: string, note?: string) {
    const employee = await this.employee(staffId);
    const { tenantId, companyId } = this.scope();

    return this.prisma.$transaction(async (tx) => {
      const assets = await tx.$queryRawUnsafe<any[]>(
        `SELECT id,assigned_to_staff_id AS "assignedToStaffId"
         FROM inventory_assets
         WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text
         LIMIT 1
         FOR UPDATE`,
        assetId,
        tenantId,
        companyId,
      );
      const asset = assets[0];
      if (!asset) throw new NotFoundException('Envanter varlığı bulunamadı.');
      if (asset.assignedToStaffId !== employee.id) {
        throw new BadRequestException('Bu varlık seçili çalışana zimmetli değil.');
      }

      await tx.$executeRawUnsafe(
        `UPDATE inventory_assets
         SET assigned_to_staff_id=NULL,updated_at=NOW()
         WHERE id=$1::text`,
        assetId,
      );

      const closed = await tx.$executeRawUnsafe(
        `UPDATE inventory_asset_assignments
         SET returned_at=NOW(),
             note=CASE WHEN $3::text IS NULL THEN note
                       WHEN note IS NULL OR note='' THEN $3::text
                       ELSE note || ' · İade: ' || $3::text END
         WHERE asset_id=$1::text AND staff_id=$2::text AND returned_at IS NULL`,
        assetId,
        employee.id,
        note?.trim() || null,
      );

      if (!closed) {
        await tx.$executeRawUnsafe(
          `INSERT INTO inventory_asset_assignments(asset_id,staff_id,branch_id,assigned_at,returned_at,note)
           VALUES($1::text,$2::text,$3::text,NOW(),NOW(),$4)`,
          assetId,
          employee.id,
          employee.branchId,
          note?.trim() || 'Zimmet iadesi',
        );
      }

      return { returned: true, assetId, staffId: employee.id };
    });
  }
}
