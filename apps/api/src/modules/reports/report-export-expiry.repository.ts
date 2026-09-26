import { Injectable } from '@nestjs/common';

import { Prisma, PrismaService } from '@beauty-erp/database';

@Injectable()
export class ReportExportExpiryRepository {
  constructor(private readonly prisma: PrismaService) {}

  expireDue(limit: number) {
    return this.prisma.$queryRaw<
      Array<{ id: string; storageKey: string | null }>
    >(Prisma.sql`
      WITH due AS (
        SELECT "id"
        FROM "report_export_jobs"
        WHERE "status" = 'READY'
          AND "expires_at" IS NOT NULL
          AND "expires_at" <= CURRENT_TIMESTAMP
        ORDER BY "expires_at" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${limit}
      )
      UPDATE "report_export_jobs" AS job
      SET
        "status" = 'EXPIRED',
        "updated_at" = CURRENT_TIMESTAMP
      FROM due
      WHERE job."id" = due."id"
      RETURNING
        job."id" AS "id",
        job."storage_key" AS "storageKey"
    `);
  }
}
