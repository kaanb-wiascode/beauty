import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Marketplace booking database invariants', () => {
  it('prevents active staff appointment overlaps and scopes booking references', () => {
    const migration = readFileSync(
      resolve(
        __dirname,
        '../../../../../packages/database/prisma/migrations/20260912235900_marketplace_booking_orchestration/migration.sql',
      ),
      'utf8',
    );

    expect(migration).toContain('appointments_active_staff_time_excl');
    expect(migration).toContain('tsrange("startAt", "endAt", \'[)\') WITH &&');
    expect(migration).toContain("'CANCELLED'::\"AppointmentStatus\"");
    expect(migration).toContain("'NO_SHOW'::\"AppointmentStatus\"");
    expect(migration).toContain('marketplace_bookings_scope_idempotency_key');
    expect(migration).toContain('marketplace_bookings_scope_guard');
    expect(migration).toContain('marketplace_booking_events');
  });
});
