import { AuditLogService } from './audit-log.service';

describe('AuditLogService', () => {
  it('persists audit events with parameterized values and no sensitive payload', async () => {
    const executeRaw = jest.fn().mockResolvedValue(1);
    const service = new AuditLogService({ $executeRaw: executeRaw } as never);

    await service.record({
      tenantId: 'tenant-1',
      companyId: 'company-1',
      branchId: 'branch-1',
      actorUserId: 'user-1',
      requestId: 'request-1',
      action: 'http.post',
      resource: '/api/customers',
      result: 'SUCCESS',
      statusCode: 201,
      metadata: { method: 'POST' },
    });

    expect(executeRaw).toHaveBeenCalledTimes(1);
    const query = executeRaw.mock.calls[0]?.[0];
    expect(query).toBeDefined();
    expect(String(query.sql)).toContain('INSERT INTO "audit_events"');
    expect(String(query.sql)).not.toContain('password');
    expect(String(query.sql)).not.toContain('access_token');
  });

  it('does not throw when audit persistence fails', async () => {
    const executeRaw = jest.fn().mockRejectedValue(new Error('db unavailable'));
    const service = new AuditLogService({ $executeRaw: executeRaw } as never);

    await expect(
      service.record({
        action: 'http.delete',
        resource: '/api/customers/1',
        result: 'FAILURE',
        statusCode: 500,
      }),
    ).resolves.toBeUndefined();
  });
});
