import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import type {
  CreateDigitalAssetInput,
  ListDigitalAssetsInput,
} from './digital-assets.schemas';

type AssetRow = {
  id: string;
  branchId: string | null;
  name: string;
  assetType: string;
  active: boolean;
  [key: string]: unknown;
};

@Injectable()
export class DigitalAssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  private context() {
    return this.tenantContext.getContext();
  }

  private async assertBranch(branchId: string) {
    const { companyId } = this.context();
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, companyId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!branch) throw new BadRequestException('Digital asset branch is outside the active company.');
  }

  async list(filters: ListDigitalAssetsInput) {
    const { tenantId, companyId, branchId } = this.context();
    return this.prisma.$queryRawUnsafe<AssetRow[]>(
      `SELECT a.id,a.branch_id AS "branchId",b.name AS "branchName",a.name,a.asset_type AS "assetType",
              a.storage_key AS "storageKey",a.external_url AS "externalUrl",a.version,a.usage_rules AS "usageRules",
              a.mime_type AS "mimeType",a.file_size_bytes AS "fileSizeBytes",a.width_px AS "widthPx",
              a.height_px AS "heightPx",a.duration_seconds AS "durationSeconds",a.checksum_sha256 AS "checksumSha256",
              a.rights_owner AS "rightsOwner",a.license_expires_at AS "licenseExpiresAt",a.tags,a.metadata,a.active,
              CASE
                WHEN a.license_expires_at IS NULL THEN 'UNTRACKED'
                WHEN a.license_expires_at < NOW() THEN 'EXPIRED'
                WHEN a.license_expires_at <= NOW() + INTERVAL '30 days' THEN 'EXPIRING'
                ELSE 'VALID'
              END AS "licenseState",
              a.created_at AS "createdAt",a.updated_at AS "updatedAt"
       FROM corporate_brand_assets a
       LEFT JOIN branches b ON b.id=a.branch_id
       WHERE a.tenant_id=$1::text AND a.company_id=$2::text AND a.active=TRUE
         AND ($3::text IS NULL OR a.branch_id IS NULL OR a.branch_id=$3::text)
         AND ($4::text IS NULL OR a.asset_type=$4::text)
         AND ($5::text IS NULL OR a.name ILIKE '%' || $5 || '%' OR COALESCE(a.rights_owner,'') ILIKE '%' || $5 || '%')
         AND ($6::text IS NULL OR (
           CASE
             WHEN a.license_expires_at IS NULL THEN 'UNTRACKED'
             WHEN a.license_expires_at < NOW() THEN 'EXPIRED'
             WHEN a.license_expires_at <= NOW() + INTERVAL '30 days' THEN 'EXPIRING'
             ELSE 'VALID'
           END
         )=$6::text)
       ORDER BY a.updated_at DESC,a.id
       LIMIT $7`,
      tenantId,
      companyId,
      branchId,
      filters.assetType ?? null,
      filters.search?.trim() || null,
      filters.licenseState ?? null,
      filters.limit,
    );
  }

  async create(input: CreateDigitalAssetInput, actorUserId: string) {
    const context = this.context();
    const branchId = context.branchId ?? input.branchId ?? null;

    if (context.branchId && input.branchId && input.branchId !== context.branchId) {
      throw new BadRequestException('Digital asset cannot be created outside the active branch.');
    }
    if (branchId) await this.assertBranch(branchId);

    return this.prisma.$transaction(async (tx) => {
      if (input.checksumSha256) {
        const duplicates = await tx.$queryRawUnsafe<AssetRow[]>(
          `SELECT id,branch_id AS "branchId",name,asset_type AS "assetType",active
           FROM corporate_brand_assets
           WHERE tenant_id=$1::text AND company_id=$2::text AND checksum_sha256=$3 AND active=TRUE
           LIMIT 1 FOR UPDATE`,
          context.tenantId,
          context.companyId,
          input.checksumSha256,
        );
        if (duplicates.length) {
          const duplicate = duplicates[0];
          if (context.branchId && duplicate.branchId !== null && duplicate.branchId !== context.branchId) {
            throw new ConflictException('An identical digital asset already exists outside the active branch.');
          }
          return { asset: duplicate, idempotent: true };
        }
      }

      const [asset] = await tx.$queryRawUnsafe<AssetRow[]>(
        `INSERT INTO corporate_brand_assets(
           tenant_id,company_id,branch_id,name,asset_type,storage_key,external_url,version,usage_rules,
           mime_type,file_size_bytes,width_px,height_px,duration_seconds,checksum_sha256,rights_owner,
           license_expires_at,tags,metadata,created_by_user_id
         ) VALUES(
           $1::text,$2::text,$3::text,$4,$5,$6,$7,$8,$9,$10,$11::bigint,$12,$13,$14,$15,$16,$17::timestamptz,$18::jsonb,$19::jsonb,$20::text
         )
         RETURNING id,branch_id AS "branchId",name,asset_type AS "assetType",storage_key AS "storageKey",
                   external_url AS "externalUrl",version,usage_rules AS "usageRules",mime_type AS "mimeType",
                   file_size_bytes AS "fileSizeBytes",width_px AS "widthPx",height_px AS "heightPx",
                   duration_seconds AS "durationSeconds",checksum_sha256 AS "checksumSha256",rights_owner AS "rightsOwner",
                   license_expires_at AS "licenseExpiresAt",tags,metadata,active,created_at AS "createdAt"`,
        context.tenantId,
        context.companyId,
        branchId,
        input.name,
        input.assetType,
        input.storageKey ?? null,
        input.externalUrl ?? null,
        input.version ?? null,
        input.usageRules ?? null,
        input.mimeType ?? null,
        input.fileSizeBytes ?? null,
        input.widthPx ?? null,
        input.heightPx ?? null,
        input.durationSeconds ?? null,
        input.checksumSha256 ?? null,
        input.rightsOwner ?? null,
        input.licenseExpiresAt ?? null,
        JSON.stringify(input.tags),
        JSON.stringify(input.metadata),
        actorUserId,
      );
      await this.appendEvent(tx, asset, actorUserId, 'CREATED');
      return { asset, idempotent: false };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async archive(id: string, actorUserId: string) {
    const context = this.context();
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRawUnsafe<AssetRow[]>(
        `SELECT id,branch_id AS "branchId",name,asset_type AS "assetType",active
         FROM corporate_brand_assets
         WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text
           AND ($4::text IS NULL OR branch_id=$4::text)
         FOR UPDATE`,
        id,
        context.tenantId,
        context.companyId,
        context.branchId,
      );
      const asset = rows[0];
      if (!asset) throw new NotFoundException('Digital asset not found.');
      if (!asset.active) return { id, archived: true, idempotent: true };

      await tx.$executeRawUnsafe(
        `UPDATE corporate_brand_assets SET active=FALSE,updated_at=NOW() WHERE id=$1::text`,
        id,
      );
      await this.appendEvent(tx, { ...asset, active: false }, actorUserId, 'ARCHIVED');
      return { id, archived: true, idempotent: false };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  private async appendEvent(
    tx: Prisma.TransactionClient,
    asset: AssetRow,
    actorUserId: string,
    eventType: string,
  ) {
    const { tenantId, companyId } = this.context();
    const snapshot = JSON.stringify(
      asset,
      (_key, value: unknown) => typeof value === 'bigint' ? value.toString() : value,
    );
    await tx.$executeRawUnsafe(
      `INSERT INTO corporate_digital_asset_events(
         tenant_id,company_id,branch_id,asset_id,event_type,actor_user_id,snapshot
       ) VALUES($1::text,$2::text,$3::text,$4::text,$5,$6::text,$7::jsonb)`,
      tenantId,
      companyId,
      asset.branchId,
      asset.id,
      eventType,
      actorUserId,
      snapshot,
    );
  }
}
