import { Injectable } from '@nestjs/common';

import { Prisma, PrismaService } from '@beauty-erp/database';

@Injectable()
export class ReportExportStaleRepository {
  constructor(private readonly prisma: PrismaService) {}

  failStale(threshold: Date, limit: number) {
    return this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      WITH stale AS (
        SELECT "id"
        FROM "report_export_jobs"
        WHERE "status" = 'PROCESSING'
          AND "started_at" IS NOT NULL
          AND "started_at" < ${threshold}
        ORDER BY "started_at" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${limit}
      )
      UPDATE "report_export_jobs" AS job
      SET
        "status" = 'FAILED',
        "completed_at" = CURRENT_TIMESTAMP,
        "updated_at" = CURRENT_TIMESTAMP,
        "error_code" = 'WORKER_TIMEOUT',
        "error_summary" = 'Export processing did not complete within the worker timeout.'
      FROM stale
      WHERE job."id" = stale."id"
        AND job."status" = 'PROCESSING'
      RETURNING job."id" AS "id"
    `);
  }
}
