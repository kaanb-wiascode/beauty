import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@beauty-erp/database';
import { MarketplaceBookingService } from './marketplace-booking.service';

const input = {
  companySlug: 'demo-company',
  branchCode: 'MERKEZ',
  serviceId: 'service-1',
  startAt: new Date(Date.now() + 86_400_000),
  idempotencyKey: 'booking-request-123',
  firstName: 'Ada',
  lastName: 'Yilmaz',
  email: 'ada@example.com',
};

function harness(query: jest.Mock, execute = jest.fn().mockResolvedValue(1)) {
  const tx = { $queryRawUnsafe: query, $executeRawUnsafe: execute };
  const transaction = jest.fn(async (callback, options) => {
    expect(options).toEqual({ isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return callback(tx);
  });
  return {
    service: new MarketplaceBookingService({ $transaction: transaction } as never),
    execute,
    transaction,
  };
}

const scope = {
  tenantId: 'tenant-1',
  companyId: 'company-1',
  branchId: 'branch-1',
  branchName: 'Merkez',
  serviceId: 'service-1',
  serviceName: 'Cilt Bakımı',
  durationMinutes: 60,
};

describe('MarketplaceBookingService', () => {
  it('requires a published active branch and service scope', async () => {
    const query = jest.fn().mockResolvedValueOnce([]);
    const { service } = harness(query);

    await expect(service.create(input)).rejects.toBeInstanceOf(NotFoundException);

    const sql = String(query.mock.calls[0][0]);
    expect(sql).toContain("mp.status='PUBLISHED'");
    expect(sql).toContain("b.status='ACTIVE'");
    expect(sql).toContain("c.status='ACTIVE'");
    expect(sql).toContain("s.status='ACTIVE'");
    expect(sql).toContain('s."branchId"=mp.branch_id');
  });

  it('returns the existing booking for the same scoped idempotency key without new writes', async () => {
    const startAt = new Date(Date.now() + 86_400_000);
    const endAt = new Date(startAt.getTime() + 3_600_000);
    const query = jest.fn()
      .mockResolvedValueOnce([scope])
      .mockResolvedValueOnce([{ pg_advisory_xact_lock: null }])
      .mockResolvedValueOnce([{
        bookingReference: 'booking-ref-1',
        status: 'CONFIRMED',
        startAt,
        endAt,
        serviceName: 'Cilt Bakımı',
        branchName: 'Merkez',
      }]);
    const { service, execute } = harness(query);

    await expect(service.create({ ...input, startAt })).resolves.toEqual({
      bookingReference: 'booking-ref-1',
      status: 'CONFIRMED',
      startAt,
      endAt,
      service: { name: 'Cilt Bakımı' },
      branch: { name: 'Merkez' },
    });

    expect(String(query.mock.calls[1][0])).toContain('pg_advisory_xact_lock');
    expect(String(query.mock.calls[2][0])).toContain('mb.idempotency_key=$4');
    expect(execute).not.toHaveBeenCalled();
  });

  it('fails when every active staff member conflicts at the requested time', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce([scope])
      .mockResolvedValueOnce([{ pg_advisory_xact_lock: null }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'staff-1' }])
      .mockResolvedValueOnce([{ pg_advisory_xact_lock: null }])
      .mockResolvedValueOnce([{ id: 'appointment-existing' }]);
    const { service, execute } = harness(query);

    await expect(service.create(input)).rejects.toBeInstanceOf(ConflictException);
    const overlapSql = String(query.mock.calls[5][0]);
    expect(overlapSql).toContain("status NOT IN ('CANCELLED','NO_SHOW')");
    expect(overlapSql).toContain('"startAt" < $5 AND "endAt" > $4');
    expect(execute).not.toHaveBeenCalled();
  });

  it('commits customer appointment booking and append-only event in one transaction', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce([scope])
      .mockResolvedValueOnce([{ pg_advisory_xact_lock: null }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'staff-1' }])
      .mockResolvedValueOnce([{ pg_advisory_xact_lock: null }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        bookingReference: 'booking-ref-new',
        status: 'CONFIRMED',
        startAt: input.startAt,
        endAt: new Date(input.startAt.getTime() + 3_600_000),
      }]);
    const execute = jest.fn().mockResolvedValue(1);
    const { service } = harness(query, execute);

    const result = await service.create(input);

    expect(result).toMatchObject({
      bookingReference: 'booking-ref-new',
      status: 'CONFIRMED',
      service: { name: 'Cilt Bakımı' },
      branch: { name: 'Merkez' },
    });
    expect(result).not.toHaveProperty('customerId');
    expect(result).not.toHaveProperty('appointmentId');
    expect(result).not.toHaveProperty('staffId');

    const customerInsert = execute.mock.calls.find((call) => String(call[0]).includes('INSERT INTO customers'));
    const appointmentInsert = execute.mock.calls.find((call) => String(call[0]).includes('INSERT INTO appointments'));
    const eventInsert = execute.mock.calls.find((call) => String(call[0]).includes('marketplace_booking_events'));
    expect(customerInsert).toBeDefined();
    expect(appointmentInsert).toBeDefined();
    expect(eventInsert).toBeDefined();
  });
});
