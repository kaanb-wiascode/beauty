import {
  canTransitionVisit,
  transitionTimestampColumn,
} from './visit-lifecycle';

describe('visit lifecycle', () => {
  it('allows the expected happy-path transitions', () => {
    expect(canTransitionVisit('EXPECTED', 'CHECKED_IN')).toBe(true);
    expect(canTransitionVisit('CHECKED_IN', 'WAITING')).toBe(true);
    expect(canTransitionVisit('WAITING', 'IN_SERVICE')).toBe(true);
    expect(canTransitionVisit('IN_SERVICE', 'SERVICE_COMPLETED')).toBe(true);
    expect(canTransitionVisit('SERVICE_COMPLETED', 'CHECKOUT_PENDING')).toBe(true);
    expect(canTransitionVisit('CHECKOUT_PENDING', 'CHECKED_OUT')).toBe(true);
  });

  it('rejects destructive or backwards transitions', () => {
    expect(canTransitionVisit('CHECKED_OUT', 'WAITING')).toBe(false);
    expect(canTransitionVisit('SERVICE_COMPLETED', 'IN_SERVICE')).toBe(false);
    expect(canTransitionVisit('IN_SERVICE', 'CANCELLED')).toBe(false);
  });

  it('maps auditable lifecycle states to their timestamps', () => {
    expect(transitionTimestampColumn('CHECKED_IN')).toBe('checkedInAt');
    expect(transitionTimestampColumn('IN_SERVICE')).toBe('serviceStartedAt');
    expect(transitionTimestampColumn('CHECKED_OUT')).toBe('checkedOutAt');
    expect(transitionTimestampColumn('WAITING')).toBeNull();
  });
});
