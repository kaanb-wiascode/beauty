import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { PrismaService } from '@beauty-erp/database';

import { TenantContext } from '../../common/tenant/tenant-context';

type MarketplacePublicationRow = {
  id: string;
  tenantId: string;
  companyId: string;
  branchId: string;
  status: 'UNPUBLISHED' | 'PUBLISHED';
  publishedAt: Date | null;
  unpublishedAt: Date | null;
  publishedByUserId: string | null;
  unpublishedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type PublicPublicationScope = {
  tenantId: string;
  companyId: string;
  branchId: string;
};

@Injectable()
export class MarketplaceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  private scope() {
    const tenantId = this.tenantContext.getTenantId();
    const companyId = this.tenantContext.getCompanyId();
    const branchId = this.tenantContext.getBranchId();

    if (!branchId) {
      throw new BadRequestException(
        'A branch must be selected for Marketplace operations.',
      );
    }

    return { tenantId, companyId, branchId };
  }

  private async requireActiveBranch() {
    const { tenantId, companyId, branchId } = this.scope();
    const branch = await this.prisma.branch.findFirst({
      where: {
        id: branchId,
        companyId,
        status: 'ACTIVE',
        company: {
          tenantId,
          status: 'ACTIVE',
        },
      },
      select: { id: true },
    });

    if (!branch) {
      throw new NotFoundException('Active branch not found');
    }

    return { tenantId, companyId, branchId };
  }

  private publicationResponse(row?: MarketplacePublicationRow) {
    if (!row) {
      return {
        status: 'UNPUBLISHED' as const,
        public: false,
        publishedAt: null,
        unpublishedAt: null,
      };
    }

    return {
      status: row.status,
      public: row.status === 'PUBLISHED',
      publishedAt: row.publishedAt,
      unpublishedAt: row.unpublishedAt,
    };
  }

  async publicationStatus() {
    const { tenantId, companyId, branchId } = this.scope();
    const rows = await this.prisma.$queryRawUnsafe<MarketplacePublicationRow[]>(
      `SELECT
         id,
         tenant_id AS "tenantId",
         company_id AS "companyId",
         branch_id AS "branchId",
         status,
         published_at AS "publishedAt",
         unpublished_at AS "unpublishedAt",
         published_by_user_id AS "publishedByUserId",
         unpublished_by_user_id AS "unpublishedByUserId",
         created_at AS "createdAt",
         updated_at AS "updatedAt"
       FROM marketplace_publications
       WHERE tenant_id=$1 AND company_id=$2 AND branch_id=$3
       LIMIT 1`,
      tenantId,
      companyId,
      branchId,
    );

    return this.publicationResponse(rows[0]);
  }

  async publishCurrentBranch(userId: string) {
    const { tenantId, companyId, branchId } = await this.requireActiveBranch();
    const rows = await this.prisma.$queryRawUnsafe<MarketplacePublicationRow[]>(
      `INSERT INTO marketplace_publications(
         id,tenant_id,company_id,branch_id,status,
         published_at,published_by_user_id,created_at,updated_at
       ) VALUES($1,$2,$3,$4,'PUBLISHED',NOW(),$5,NOW(),NOW())
       ON CONFLICT (branch_id)
       DO UPDATE SET
         tenant_id=EXCLUDED.tenant_id,
         company_id=EXCLUDED.company_id,
         status='PUBLISHED',
         published_at=CASE
           WHEN marketplace_publications.status='PUBLISHED'
             THEN marketplace_publications.published_at
           ELSE NOW()
         END,
         published_by_user_id=CASE
           WHEN marketplace_publications.status='PUBLISHED'
             THEN marketplace_publications.published_by_user_id
           ELSE EXCLUDED.published_by_user_id
         END,
         unpublished_at=NULL,
         unpublished_by_user_id=NULL,
         updated_at=NOW()
       RETURNING
         id,
         tenant_id AS "tenantId",
         company_id AS "companyId",
         branch_id AS "branchId",
         status,
         published_at AS "publishedAt",
         unpublished_at AS "unpublishedAt",
         published_by_user_id AS "publishedByUserId",
         unpublished_by_user_id AS "unpublishedByUserId",
         created_at AS "createdAt",
         updated_at AS "updatedAt"`,
      randomUUID(),
      tenantId,
      companyId,
      branchId,
      userId,
    );

    return this.publicationResponse(rows[0]);
  }

  async unpublishCurrentBranch(userId: string) {
    const { tenantId, companyId, branchId } = await this.requireActiveBranch();
    const rows = await this.prisma.$queryRawUnsafe<MarketplacePublicationRow[]>(
      `INSERT INTO marketplace_publications(
         id,tenant_id,company_id,branch_id,status,
         unpublished_at,unpublished_by_user_id,created_at,updated_at
       ) VALUES($1,$2,$3,$4,'UNPUBLISHED',NULL,NULL,NOW(),NOW())
       ON CONFLICT (branch_id)
       DO UPDATE SET
         tenant_id=EXCLUDED.tenant_id,
         company_id=EXCLUDED.company_id,
         status='UNPUBLISHED',
         unpublished_at=CASE
           WHEN marketplace_publications.status='PUBLISHED'
             THEN NOW()
           ELSE marketplace_publications.unpublished_at
         END,
         unpublished_by_user_id=CASE
           WHEN marketplace_publications.status='PUBLISHED'
             THEN $5
           ELSE marketplace_publications.unpublished_by_user_id
         END,
         updated_at=NOW()
       RETURNING
         id,
         tenant_id AS "tenantId",
         company_id AS "companyId",
         branch_id AS "branchId",
         status,
         published_at AS "publishedAt",
         unpublished_at AS "unpublishedAt",
         published_by_user_id AS "publishedByUserId",
         unpublished_by_user_id AS "unpublishedByUserId",
         created_at AS "createdAt",
         updated_at AS "updatedAt"`,
      randomUUID(),
      tenantId,
      companyId,
      branchId,
      userId,
    );

    return this.publicationResponse(rows[0]);
  }

  async publicListing(companySlug: string, branchCode: string) {
    const scopes = await this.prisma.$queryRawUnsafe<PublicPublicationScope[]>(
      `SELECT
         mp.tenant_id AS "tenantId",
         mp.company_id AS "companyId",
         mp.branch_id AS "branchId"
       FROM marketplace_publications mp
       JOIN branches b ON b.id=mp.branch_id
       JOIN companies c ON c.id=mp.company_id
       WHERE mp.status='PUBLISHED'
         AND b.status='ACTIVE'
         AND c.status='ACTIVE'
         AND b."companyId"=mp.company_id
         AND c."tenantId"=mp.tenant_id
         AND c.slug=$1
         AND b.code=$2
       LIMIT 1`,
      companySlug,
      branchCode,
    );

    const scope = scopes[0];
    if (!scope) {
      throw new NotFoundException('Marketplace listing not found');
    }

    const branch = await this.prisma.branch.findFirst({
      where: {
        id: scope.branchId,
        companyId: scope.companyId,
        code: branchCode,
        status: 'ACTIVE',
        company: {
          id: scope.companyId,
          tenantId: scope.tenantId,
          slug: companySlug,
          status: 'ACTIVE',
        },
      },
      select: {
        name: true,
        code: true,
        address: true,
        phone: true,
        email: true,
        company: {
          select: {
            name: true,
            slug: true,
          },
        },
        services: {
          where: {
            tenantId: scope.tenantId,
            status: 'ACTIVE',
          },
          orderBy: {
            name: 'asc',
          },
          select: {
            id: true,
            name: true,
            description: true,
            durationMinutes: true,
            price: true,
          },
        },
      },
    });

    if (!branch) {
      throw new NotFoundException('Marketplace listing not found');
    }

    return {
      listing: {
        company: branch.company,
        branch: {
          name: branch.name,
          code: branch.code,
          address: branch.address,
          phone: branch.phone,
          email: branch.email,
        },
        services: branch.services,
      },
      publication: {
        status: 'PUBLISHED' as const,
        public: true,
      },
    };
  }

  /**
   * Produces the exact public-safe projection that a branch would expose to
   * Marketplace. The preview remains tenant-authenticated even when a branch
   * has opted in to publication.
   */
  async previewCurrentBranch() {
    const { tenantId, companyId, branchId } = this.scope();

    const branch = await this.prisma.branch.findFirst({
      where: {
        id: branchId,
        companyId,
        status: 'ACTIVE',
        company: {
          tenantId,
          status: 'ACTIVE',
        },
      },
      select: {
        id: true,
        name: true,
        code: true,
        address: true,
        phone: true,
        email: true,
        company: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        services: {
          where: {
            tenantId,
            status: 'ACTIVE',
          },
          orderBy: {
            name: 'asc',
          },
          select: {
            id: true,
            name: true,
            description: true,
            durationMinutes: true,
            price: true,
          },
        },
      },
    });

    if (!branch) {
      throw new NotFoundException('Active branch not found');
    }

    return {
      listing: {
        company: branch.company,
        branch: {
          id: branch.id,
          name: branch.name,
          code: branch.code,
          address: branch.address,
          phone: branch.phone,
          email: branch.email,
        },
        services: branch.services,
      },
      publication: await this.publicationStatus(),
    };
  }
}
