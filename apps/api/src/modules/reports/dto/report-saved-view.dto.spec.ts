import {
  createReportSavedViewSchema,
  updateReportSavedViewSchema,
} from './report-saved-view.dto';

describe('saved report DTOs', () => {
  const base = {
    name: 'Aylık personel performansı',
    reportKey: 'staff.performance' as const,
    filters: {
      from: '2026-09-01T00:00:00.000Z',
      to: '2026-09-30T23:59:59.999Z',
    },
    columns: ['name', 'collected'],
  };

  it('parses a controlled saved report snapshot', () => {
    const parsed = createReportSavedViewSchema.parse(base);
    expect(parsed.reportKey).toBe('staff.performance');
    expect(parsed.columns).toEqual(['name', 'collected']);
    expect(parsed.isFavorite).toBe(false);
  });

  it('rejects scope, ownership and arbitrary persistence fields', () => {
    for (const payload of [
      { ...base, tenantId: 'other-tenant' },
      { ...base, companyId: 'other-company' },
      { ...base, branchId: 'other-branch' },
      { ...base, ownerId: 'other-user' },
      { ...base, storageKey: 'arbitrary' },
    ]) {
      expect(() => createReportSavedViewSchema.parse(payload)).toThrow();
    }
  });

  it('rejects arbitrary report keys and empty updates', () => {
    expect(() =>
      createReportSavedViewSchema.parse({ ...base, reportKey: 'sql.freeform' }),
    ).toThrow();
    expect(() => updateReportSavedViewSchema.parse({})).toThrow();
  });
});
