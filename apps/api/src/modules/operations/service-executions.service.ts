import {
  BadRequestException,
  ConflictException,
  Injectable,
  Optional,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';

import { Prisma, PrismaService } from '@beauty-erp/database';

import { TenantContext } from '../../common/tenant/tenant-context';
import { DomainEventsService } from '../../infrastructure/domain-events/domain-events.service';
import type {
  CompleteServiceExecutionInput,
  StartServiceExecutionInput,
} from './dto/service-execution.dto';

type ExecutionRow = {
  id: string;
  visitId: string;
  appointmentId: string;
  serviceId: string;
  staffId: string;
  roomId: string | null;
  assetId: string | null;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  startedAt: Date;
  completedAt: Date | null;
  note: string | null;
  completionNote: string | null;
  version: number;
};

type AllocationContextRow = {
  roomId: string | null;
  roomType: string | null;
  roomStatus: string | null;
  assetId: string | null;
  assetType: string | null;
  assetStatus: string | null;
  assetMaintenanceBlocked: boolean;
};

@Injectable()
export class ServiceExecutionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
    @Optional()
    private readonly domainEvents?: DomainEventsService,
  ) {}

  private context() {
    const tenantId = this.tenantContext.getTenantId();
    const companyId = this.tenantContext.getCompanyId();
    const branchId = this.tenantContext.getBranchId();
    const membershipId = this.tenantContext.getMembershipId();

    if (!tenantId || !companyId || !membershipId) {
      throw new InternalServerErrorException(
        'İşletme çalışma kapsamı eksik.',
      );
    }
    if (!branchId) {
      throw new BadRequestException(
        'Bu işlem için önce aktif bir şube seçmelisiniz.',
      );
    }

    return { tenantId, companyId, branchId, membershipId };
  }

  async listByVisit(visitId: string) {
    const { tenantId, companyId, branchId } = this.context();
    const executions = await this.prisma.$queryRawUnsafe<ExecutionRow[]>(
      `SELECT e.id, e.visit_id AS "visitId", e.appointment_id AS "appointmentId",
              e.service_id AS "serviceId", e.staff_id AS "staffId",
              e.room_id AS "roomId", e.inventory_asset_id AS "assetId",
              e.status, e.started_at AS "startedAt", e.completed_at AS "completedAt",
              e.note, e.completion_note AS "completionNote", e.version
       FROM operations_service_executions e
       WHERE e.visit_id = $1 AND e.tenant_id = $2
         AND e.company_id = $3 AND e.branch_id = $4
       ORDER BY e.started_at ASC, e.id ASC`,
      visitId,
      tenantId,
      companyId,
      branchId,
    );

    if (!executions.length) return [];

    const appointments = await this.prisma.appointment.findMany({
      where: {
        id: { in: executions.map((execution) => execution.appointmentId) },
        tenantId,
        branchId,
      },
      select: {
        id: true,
        status: true,
        session: {
          select: {
            id: true,
            status: true,
          },
        },
      },
    });
    const appointmentMap = new Map(
      appointments.map((appointment) => [appointment.id, appointment]),
    );

    return executions.map((execution) => {
      const appointment = appointmentMap.get(execution.appointmentId);
      return {
        ...execution,
        appointmentStatus: appointment?.status ?? null,
        packageSessionId: appointment?.session?.id ?? null,
        packageSessionStatus: appointment?.session?.status ?? null,
      };
    });
  }

  async start(visitId: string, input: StartServiceExecutionInput) {
    const { tenantId, companyId, branchId, membershipId } = this.context();

    let eventId: string | null = null;
    const result = await this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRawUnsafe(
          `WITH _advisory_lock AS (SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))) SELECT 1 FROM _advisory_lock`,
          `${tenantId}:${branchId}`,
          `execution:${input.appointmentId}`,
        );

        const existing = await tx.$queryRawUnsafe<ExecutionRow[]>(
          `SELECT id, visit_id AS "visitId", appointment_id AS "appointmentId",
                  service_id AS "serviceId", staff_id AS "staffId",
                  room_id AS "roomId", inventory_asset_id AS "assetId",
                  status, started_at AS "startedAt", completed_at AS "completedAt",
                  note, completion_note AS "completionNote", version
           FROM operations_service_executions
           WHERE appointment_id = $1 AND visit_id = $2
             AND tenant_id = $3 AND company_id = $4 AND branch_id = $5
             AND status <> 'CANCELLED'::"ServiceExecutionStatus"
           LIMIT 1`,
          input.appointmentId,
          visitId,
          tenantId,
          companyId,
          branchId,
        );
        if (existing[0]) return existing[0];

        const rows = await tx.$queryRawUnsafe<
          Array<{
            visitId: string;
            visitStatus: string;
            appointmentId: string;
            appointmentStatus: string;
            serviceId: string;
            staffId: string;
          }>
        >(
          `SELECT v."id" AS "visitId", v."status"::text AS "visitStatus",
                  a."id" AS "appointmentId", a."status"::text AS "appointmentStatus",
                  a."serviceId" AS "serviceId", a."staffId" AS "staffId"
           FROM "visits" v
           JOIN "visit_appointments" va ON va."visitId" = v."id"
           JOIN "appointments" a ON a."id" = va."appointmentId"
           WHERE v."id" = $1 AND va."appointmentId" = $2
             AND v."tenantId" = $3 AND v."companyId" = $4 AND v."branchId" = $5
             AND a."tenantId" = $3 AND a."branchId" = $5
           LIMIT 1`,
          visitId,
          input.appointmentId,
          tenantId,
          companyId,
          branchId,
        );
        const context = rows[0];
        if (!context) {
          throw new NotFoundException(
            'Aktif şubede ziyaret veya bağlı randevu bulunamadı.',
          );
        }
        if (context.visitStatus !== 'IN_SERVICE') {
          throw new BadRequestException(
            'Hizmeti başlatmadan önce ziyaretin hizmet aşamasına alınması gerekir.',
          );
        }
        if (!['SCHEDULED', 'CONFIRMED'].includes(context.appointmentStatus)) {
          throw new BadRequestException(
            'Bağlı randevu hizmet başlatmaya uygun durumda değil.',
          );
        }

        const [requirements, allocations] = await Promise.all([
          tx.$queryRawUnsafe<
            Array<{
              roomType: string | null;
              requiredAssetType: string | null;
              requiredAssetId: string | null;
            }>
          >(
            `SELECT room_type AS "roomType", required_asset_type AS "requiredAssetType",
                    required_asset_id AS "requiredAssetId"
             FROM service_operational_requirements
             WHERE service_id = $1 AND tenant_id = $2 AND branch_id = $3
             LIMIT 1`,
            context.serviceId,
            tenantId,
            branchId,
          ),
          tx.$queryRawUnsafe<AllocationContextRow[]>(
            `SELECT ra.room_id AS "roomId", r.room_type AS "roomType",
                    r.status AS "roomStatus",
                    ra.inventory_asset_id AS "assetId", a.asset_type AS "assetType",
                    a.status AS "assetStatus",
                    CASE WHEN a.id IS NULL THEN FALSE ELSE EXISTS (
                      SELECT 1
                      FROM inventory_asset_maintenance m
                      WHERE m.asset_id = a.id
                        AND m.status IN ('PLANNED', 'IN_PROGRESS')
                        AND m.completed_at IS NULL
                        AND (m.scheduled_at IS NULL OR m.scheduled_at <= CURRENT_TIMESTAMP)
                    ) END AS "assetMaintenanceBlocked"
             FROM operations_resource_allocations ra
             LEFT JOIN operations_rooms r ON r.id = ra.room_id
             LEFT JOIN inventory_assets a ON a.id = ra.inventory_asset_id
             WHERE ra.appointment_id = $1 AND ra.tenant_id = $2
               AND ra.company_id = $3 AND ra.branch_id = $4
               AND ra.status = 'RESERVED'`,
            input.appointmentId,
            tenantId,
            companyId,
            branchId,
          ),
        ]);

        const requirement = requirements[0];
        const roomAllocation = requirement?.roomType
          ? allocations.find(
              (item) =>
                item.roomId &&
                item.roomType === requirement.roomType &&
                ['AVAILABLE', 'RESERVED'].includes(item.roomStatus ?? ''),
            )
          : allocations.find((item) => item.roomId);

        if (requirement?.roomType && !roomAllocation) {
          throw new BadRequestException(
            `Bu hizmet için uygun türde kullanılabilir bir oda ayrılması gerekiyor.`,
          );
        }

        const assetAllocation = requirement?.requiredAssetId
          ? allocations.find(
              (item) =>
                item.assetId === requirement.requiredAssetId &&
                item.assetStatus === 'ACTIVE' &&
                !item.assetMaintenanceBlocked,
            )
          : requirement?.requiredAssetType
            ? allocations.find(
                (item) =>
                  item.assetId &&
                  item.assetType === requirement.requiredAssetType &&
                  item.assetStatus === 'ACTIVE' &&
                  !item.assetMaintenanceBlocked,
              )
            : allocations.find((item) => item.assetId);

        if (
          (requirement?.requiredAssetId || requirement?.requiredAssetType) &&
          !assetAllocation
        ) {
          throw new BadRequestException(
            requirement.requiredAssetId
              ? 'Bu hizmet için tanımlanan cihazın aktif, kullanılabilir ve bakım engeli bulunmayan durumda ayrılması gerekir.'
              : 'Bu hizmet için gerekli türde aktif ve kullanılabilir bir cihaz ayrılması gerekir.',
          );
        }

        const roomId = roomAllocation?.roomId ?? null;
        const assetId = assetAllocation?.assetId ?? null;

        const created = await tx.$queryRawUnsafe<ExecutionRow[]>(
          `INSERT INTO operations_service_executions (
             tenant_id, company_id, branch_id, visit_id, appointment_id,
             service_id, staff_id, room_id, inventory_asset_id, note,
             created_by_membership_id
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
           RETURNING id, visit_id AS "visitId", appointment_id AS "appointmentId",
                     service_id AS "serviceId", staff_id AS "staffId",
                     room_id AS "roomId", inventory_asset_id AS "assetId",
                     status, started_at AS "startedAt", completed_at AS "completedAt",
                     note, completion_note AS "completionNote", version`,
          tenantId,
          companyId,
          branchId,
          visitId,
          input.appointmentId,
          context.serviceId,
          context.staffId,
          roomId,
          assetId,
          input.note ?? null,
          membershipId,
        );

        await tx.$executeRawUnsafe(
          `INSERT INTO operations_service_execution_events (
             execution_id, tenant_id, branch_id, actor_membership_id,
             event_type, from_status, to_status, note
           ) VALUES ($1,$2,$3,$4,'SERVICE_STARTED',NULL,'IN_PROGRESS',$5)`,
          created[0].id,
          tenantId,
          branchId,
          membershipId,
          input.note ?? null,
        );

        eventId =
          (await this.domainEvents?.record(tx, {
            eventName: 'service_execution.started',
            aggregateType: 'service_execution',
            aggregateId: created[0].id,
            payload: {
              visitId,
              appointmentId: created[0].appointmentId,
              serviceId: created[0].serviceId,
            },
          })) ?? null;
        return created[0];
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    if (eventId) await this.domainEvents?.dispatchStored(eventId);
    return result;
  }

  async complete(executionId: string, input: CompleteServiceExecutionInput) {
    const { tenantId, companyId, branchId, membershipId } = this.context();

    let eventId: string | null = null;
    const result = await this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRawUnsafe(
          `WITH _advisory_lock AS (SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))) SELECT 1 FROM _advisory_lock`,
          `${tenantId}:${branchId}`,
          `execution:${executionId}`,
        );

        const rows = await tx.$queryRawUnsafe<ExecutionRow[]>(
          `SELECT id, visit_id AS "visitId", appointment_id AS "appointmentId",
                  service_id AS "serviceId", staff_id AS "staffId",
                  room_id AS "roomId", inventory_asset_id AS "assetId",
                  status, started_at AS "startedAt", completed_at AS "completedAt",
                  note, completion_note AS "completionNote", version
           FROM operations_service_executions
           WHERE id = $1 AND tenant_id = $2 AND company_id = $3 AND branch_id = $4
           LIMIT 1`,
          executionId,
          tenantId,
          companyId,
          branchId,
        );
        const current = rows[0];
        if (!current) throw new NotFoundException('Hizmet icra kaydı bulunamadı.');
        if (current.version !== input.expectedVersion) {
          throw new ConflictException(
            'Hizmet kaydı başka bir işlem tarafından değiştirildi. Lütfen ekranı yenileyip tekrar deneyin.',
          );
        }
        if (current.status !== 'IN_PROGRESS') {
          throw new BadRequestException(
            'Yalnızca devam eden bir hizmet tamamlanabilir.',
          );
        }

        const completed = await tx.$queryRawUnsafe<ExecutionRow[]>(
          `UPDATE operations_service_executions
           SET status = 'COMPLETED', completed_at = CURRENT_TIMESTAMP,
               completion_note = $5, version = version + 1,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1 AND tenant_id = $2 AND company_id = $3 AND branch_id = $4
             AND status = 'IN_PROGRESS' AND version = $6
           RETURNING id, visit_id AS "visitId", appointment_id AS "appointmentId",
                     service_id AS "serviceId", staff_id AS "staffId",
                     room_id AS "roomId", inventory_asset_id AS "assetId",
                     status, started_at AS "startedAt", completed_at AS "completedAt",
                     note, completion_note AS "completionNote", version`,
          executionId,
          tenantId,
          companyId,
          branchId,
          input.completionNote ?? null,
          input.expectedVersion,
        );
        if (!completed[0]) {
          throw new ConflictException(
            'Hizmet tamamlanırken kayıt değişti. Lütfen ekranı yenileyip tekrar deneyin.',
          );
        }

        await tx.$executeRawUnsafe(
          `INSERT INTO operations_service_execution_events (
             execution_id, tenant_id, branch_id, actor_membership_id,
             event_type, from_status, to_status, note
           ) VALUES ($1,$2,$3,$4,'SERVICE_COMPLETED','IN_PROGRESS','COMPLETED',$5)`,
          executionId,
          tenantId,
          branchId,
          membershipId,
          input.completionNote ?? null,
        );

        const remaining = await tx.$queryRawUnsafe<Array<{ count: number }>>(
          `SELECT COUNT(*)::int AS count
           FROM operations_service_executions
           WHERE visit_id = $1 AND tenant_id = $2 AND branch_id = $3
             AND status = 'IN_PROGRESS'`,
          current.visitId,
          tenantId,
          branchId,
        );

        const visitCanCompleteService = Number(remaining[0]?.count ?? 0) === 0;
        eventId =
          (await this.domainEvents?.record(tx, {
            eventName: 'service_execution.completed',
            aggregateType: 'service_execution',
            aggregateId: executionId,
            payload: {
              visitId: completed[0].visitId,
              appointmentId: completed[0].appointmentId,
              serviceId: completed[0].serviceId,
              visitCanCompleteService,
            },
          })) ?? null;

        return {
          execution: completed[0],
          visitCanCompleteService,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    if (eventId) await this.domainEvents?.dispatchStored(eventId);
    return result;
  }

  async completeAppointmentHandoff(executionId: string) {
    const { tenantId, companyId, branchId, membershipId } = this.context();

    const eventIds: string[] = [];
    const result = await this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRawUnsafe(
          `WITH _advisory_lock AS (SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))) SELECT 1 FROM _advisory_lock`,
          `${tenantId}:${branchId}`,
          `execution-handoff:${executionId}`,
        );

        const executions = await tx.$queryRawUnsafe<ExecutionRow[]>(
          `SELECT id, visit_id AS "visitId", appointment_id AS "appointmentId",
                  service_id AS "serviceId", staff_id AS "staffId",
                  room_id AS "roomId", inventory_asset_id AS "assetId",
                  status, started_at AS "startedAt", completed_at AS "completedAt",
                  note, completion_note AS "completionNote", version
           FROM operations_service_executions
           WHERE id = $1 AND tenant_id = $2 AND company_id = $3 AND branch_id = $4
           LIMIT 1`,
          executionId,
          tenantId,
          companyId,
          branchId,
        );
        const execution = executions[0];
        if (!execution) throw new NotFoundException('Hizmet icra kaydı bulunamadı.');
        if (execution.status !== 'COMPLETED') {
          throw new BadRequestException(
            'Randevuyu tamamlamadan önce hizmet icrası tamamlanmalıdır.',
          );
        }

        await tx.$queryRawUnsafe(
          `WITH _advisory_lock AS (SELECT pg_advisory_xact_lock(hashtext($1))) SELECT 1 FROM _advisory_lock`,
          `appointment:${execution.appointmentId}`,
        );

        const appointment = await tx.appointment.findFirst({
          where: {
            id: execution.appointmentId,
            tenantId,
            branchId,
          },
          include: {
            session: {
              select: {
                id: true,
                status: true,
              },
            },
          },
        });
        if (!appointment) throw new NotFoundException('Randevu bulunamadı.');
        if (appointment.status === 'CANCELLED' || appointment.status === 'NO_SHOW') {
          throw new ConflictException(
            'İptal edilmiş veya gelmedi olarak işaretlenmiş randevu bu ekrandan tamamlanamaz.',
          );
        }

        if (appointment.status !== 'COMPLETED') {
          if (!['SCHEDULED', 'CONFIRMED'].includes(appointment.status)) {
            throw new ConflictException(
              `Randevu mevcut durumundan doğrudan tamamlanamaz.`,
            );
          }
          await tx.appointment.update({
            where: { id: appointment.id },
            data: { status: 'COMPLETED' },
          });

          await tx.$executeRawUnsafe(
            `INSERT INTO operations_service_execution_events (
               execution_id, tenant_id, branch_id, actor_membership_id,
               event_type, from_status, to_status, note
             ) VALUES ($1,$2,$3,$4,'APPOINTMENT_COMPLETED_HANDOFF','COMPLETED','COMPLETED',$5)`,
            execution.id,
            tenantId,
            branchId,
            membershipId,
            `Randevu ${appointment.id} hizmet icrası üzerinden tamamlandı.`,
          );
        }

        let consumedSessionId: string | null = null;
        if (appointment.session?.id && appointment.session.status === 'RESERVED') {
          const consumed = await tx.session.updateMany({
            where: {
              id: appointment.session.id,
              tenantId,
              branchId,
              appointmentId: appointment.id,
              status: 'RESERVED',
            },
            data: {
              status: 'CONSUMED',
              consumedAt: new Date(),
            },
          });

          if (consumed.count !== 1) {
            throw new ConflictException(
              'Paket seansı başka bir işlem tarafından değiştirildi. Lütfen ekranı yenileyin.',
            );
          }

          consumedSessionId = appointment.session.id;
          const consumedSession = await tx.session.findUnique({
            where: { id: appointment.session.id },
            select: { customerPackageId: true },
          });
          if (consumedSession) {
            const remaining = await tx.session.count({
              where: {
                customerPackageId: consumedSession.customerPackageId,
                status: { in: ['AVAILABLE', 'RESERVED'] },
              },
            });
            if (remaining === 0) {
              await tx.customerPackage.updateMany({
                where: {
                  id: consumedSession.customerPackageId,
                  tenantId,
                  branchId,
                  status: 'ACTIVE',
                },
                data: { status: 'COMPLETED' },
              });
            }
          }

          await tx.$executeRawUnsafe(
            `INSERT INTO operations_service_execution_events (
               execution_id, tenant_id, branch_id, actor_membership_id,
               event_type, from_status, to_status, note
             ) VALUES ($1,$2,$3,$4,'PACKAGE_SESSION_CONSUMED','COMPLETED','COMPLETED',$5)`,
            execution.id,
            tenantId,
            branchId,
            membershipId,
            'Bağlı paket seansı hizmet tamamlamasıyla otomatik tüketildi.',
          );
        }

        const refreshed = await tx.appointment.findUnique({
          where: { id: appointment.id },
          select: {
            id: true,
            status: true,
            session: {
              select: {
                id: true,
                status: true,
              },
            },
          },
        });

        const appointmentEventId = await this.domainEvents?.record(tx, {
          eventName: 'appointment.completed_from_execution',
          aggregateType: 'appointment',
          aggregateId: refreshed?.id ?? executionId,
          payload: {
            executionId,
            consumedSessionId,
          },
        });
        if (appointmentEventId) eventIds.push(appointmentEventId);

        if (consumedSessionId) {
          const sessionEventId = await this.domainEvents?.record(tx, {
            eventName: 'session.consumed',
            aggregateType: 'session',
            aggregateId: consumedSessionId,
            payload: {
              executionId,
              appointmentId: refreshed?.id ?? null,
              automatic: true,
            },
          });
          if (sessionEventId) eventIds.push(sessionEventId);
        }

        return {
          executionId: execution.id,
          appointment: refreshed,
          consumedSessionId,
          packageSessionRequiresExplicitConsumption: false,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    for (const eventId of eventIds) {
      await this.domainEvents?.dispatchStored(eventId);
    }
    return result;
  }
}
