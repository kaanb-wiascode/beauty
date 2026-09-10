export type SessionState = 'AVAILABLE' | 'RESERVED' | 'CONSUMED' | 'CANCELLED';

const allowedTransitions: Record<SessionState, SessionState[]> = {
  AVAILABLE: ['RESERVED', 'CANCELLED'],
  RESERVED: ['AVAILABLE', 'CONSUMED', 'CANCELLED'],
  CONSUMED: [],
  CANCELLED: [],
};

export function canTransitionSession(
  from: SessionState,
  to: SessionState,
): boolean {
  return allowedTransitions[from].includes(to);
}

export function assertSessionTransition(
  from: SessionState,
  to: SessionState,
): void {
  if (!canTransitionSession(from, to)) {
    throw new Error(`Invalid session transition: ${from} -> ${to}`);
  }
}
