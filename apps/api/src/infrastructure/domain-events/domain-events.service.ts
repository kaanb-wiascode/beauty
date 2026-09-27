import { randomUUID } from 'node:crypto';

import {
  Injectable,
  Logger,
  MessageEvent,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Observable, Subject, filter, interval, map, merge } from 'rxjs';

import { Prisma, PrismaService } from '@beauty-erp/database';

import { TenantContext } from '../../common/tenant/tenant-context';
import { RedisService } from '../redis/redis.service';

export type DomainEventRecord = {
  id: string;
  tenantId: string;
  companyId: string;
  branchId: string | null;
  actorMembershipId: string | null;
  eventName: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  occurredAt: string;
  originInstanceId: string;
};

export type PublishDomainEventInput = {
  eventName: string;
  aggregateType: string;
  aggregateId: string;
  payload?: Record<string, unknown>;
  occurredAt?: Date;
};

const CHANNEL = 'beauty:domain-events';

@Injectable()
export class DomainEventsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DomainEventsService.name);
  private readonly streamSubject = new Subject<DomainEventRecord>();
  private readonly instanceId = randomUUID();
  private unsubscribeRedis: (() => Promise<void>) | null = null;
  private retryTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly tenantContext: TenantContext,
  ) {}

  async onModuleInit() {
    this.unsubscribeRedis = await this.redis.subscribe(CHANNEL, (payload) => {
      try {
        const event = JSON.parse(payload) as DomainEventRecord;
        if (event.originInstanceId === this.instanceId) return;
        this.streamSubject.next(event);
      } catch (error) {
        this.logger.warn(
          'Geçersiz domain olayı yok sayıldı: ' +
            (error instanceof Error ? error.message : String(error)),
        );
      }
    });

    this.retryTimer = setInterval(() => {
      void this.publishPending();
    }, 5000);
    this.retryTimer.unref();
    void this.publishPending();
  }

  async onModuleDestroy() {
    if (this.retryTimer) clearInterval(this.retryTimer);
    if (this.unsubscribeRedis) await this.unsubscribeRedis();
    this.streamSubject.complete();
  }

  private buildEvent(input: PublishDomainEventInput): DomainEventRecord {
    const context = this.tenantContext.getContext();
    return {
      id: randomUUID(),
      tenantId: context.tenantId,
      companyId: context.companyId,
      branchId: context.branchId ?? null,
      actorMembershipId: context.membershipId ?? null,
      eventName: input.eventName,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      payload: input.payload ?? {},
      occurredAt: (input.occurredAt ?? new Date()).toISOString(),
      originInstanceId: this.instanceId,
    };
  }

  private async insert(
    db: Prisma.TransactionClient | PrismaService,
    event: DomainEventRecord,
  ) {
    await db.$executeRawUnsafe(
      'INSERT INTO domain_event_log(' +
        'id,tenant_id,company_id,branch_id,actor_membership_id,event_name,' +
        'aggregate_type,aggregate_id,payload,occurred_at' +
        ') VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)',
      event.id,
      event.tenantId,
      event.companyId,
      event.branchId,
      event.actorMembershipId,
      event.eventName,
      event.aggregateType,
      event.aggregateId,
      JSON.stringify(event.payload),
      new Date(event.occurredAt),
    );
  }

  async record(
    tx: Prisma.TransactionClient,
    input: PublishDomainEventInput,
  ): Promise<string> {
    const event = this.buildEvent(input);
    await this.insert(tx, event);
    return event.id;
  }

  async publish(input: PublishDomainEventInput): Promise<DomainEventRecord> {
    const event = this.buildEvent(input);
    await this.insert(this.prisma, event);
    await this.dispatch(event);
    return event;
  }

  async dispatchStored(id: string): Promise<void> {
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{
        id: string;
        tenantId: string;
        companyId: string;
        branchId: string | null;
        actorMembershipId: string | null;
        eventName: string;
        aggregateType: string;
        aggregateId: string;
        payload: Record<string, unknown>;
        occurredAt: Date;
      }>
    >(
      'SELECT id,tenant_id AS "tenantId",company_id AS "companyId",' +
        'branch_id AS "branchId",actor_membership_id AS "actorMembershipId",' +
        'event_name AS "eventName",aggregate_type AS "aggregateType",' +
        'aggregate_id AS "aggregateId",payload,occurred_at AS "occurredAt" ' +
        'FROM domain_event_log WHERE id=$1 LIMIT 1',
      id,
    );
    const row = rows[0];
    if (!row) return;
    await this.dispatch({
      ...row,
      occurredAt: row.occurredAt.toISOString(),
      originInstanceId: this.instanceId,
    });
  }

  stream(input: {
    tenantId: string;
    companyId: string;
    branchId: string | null;
  }): Observable<MessageEvent> {
    const events$ = this.streamSubject.pipe(
      filter(
        (event) =>
          event.tenantId === input.tenantId &&
          event.companyId === input.companyId &&
          (!input.branchId || event.branchId === input.branchId),
      ),
      map(
        (event): MessageEvent => ({
          id: event.id,
          type: event.eventName,
          data: event,
          retry: 3000,
        }),
      ),
    );

    const heartbeat$ = interval(15000).pipe(
      map(
        (): MessageEvent => ({
          type: 'operations.heartbeat',
          data: {
            eventName: 'operations.heartbeat',
            occurredAt: new Date().toISOString(),
          },
        }),
      ),
    );

    return merge(events$, heartbeat$);
  }

  private async dispatch(event: DomainEventRecord) {
    this.streamSubject.next(event);
    await this.tryPublish(event);
  }

  private async tryPublish(event: DomainEventRecord) {
    try {
      await this.redis.publish(CHANNEL, JSON.stringify(event));
      await this.prisma.$executeRawUnsafe(
        'UPDATE domain_event_log ' +
          'SET published_at=CURRENT_TIMESTAMP ' +
          'WHERE id=$1 AND published_at IS NULL',
        event.id,
      );
    } catch (error) {
      this.logger.warn(
        'Domain olayı Redis yayını başarısız, yeniden denenecek: ' +
          event.id +
          ' · ' +
          (error instanceof Error ? error.message : String(error)),
      );
    }
  }

  private async publishPending() {
    try {
      const rows = await this.prisma.$queryRawUnsafe<
        Array<{
          id: string;
          tenantId: string;
          companyId: string;
          branchId: string | null;
          actorMembershipId: string | null;
          eventName: string;
          aggregateType: string;
          aggregateId: string;
          payload: Record<string, unknown>;
          occurredAt: Date;
        }>
      >(
        'SELECT id,tenant_id AS "tenantId",company_id AS "companyId",' +
          'branch_id AS "branchId",actor_membership_id AS "actorMembershipId",' +
          'event_name AS "eventName",aggregate_type AS "aggregateType",' +
          'aggregate_id AS "aggregateId",payload,occurred_at AS "occurredAt" ' +
          'FROM domain_event_log WHERE published_at IS NULL ' +
          'ORDER BY occurred_at ASC LIMIT 100',
      );

      for (const row of rows) {
        await this.tryPublish({
          ...row,
          occurredAt: row.occurredAt.toISOString(),
          originInstanceId: this.instanceId,
        });
      }
    } catch (error) {
      this.logger.warn(
        'Bekleyen domain olayları yayınlanamadı: ' +
          (error instanceof Error ? error.message : String(error)),
      );
    }
  }
}
