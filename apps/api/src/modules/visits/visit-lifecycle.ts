export const VISIT_STATUSES = [
  'EXPECTED',
  'ARRIVED',
  'CHECKED_IN',
  'WAITING',
  'IN_SERVICE',
  'SERVICE_COMPLETED',
  'CHECKOUT_PENDING',
  'CHECKED_OUT',
  'CANCELLED',
] as const;

export type VisitStatus = (typeof VISIT_STATUSES)[number];

const allowedTransitions: Record<VisitStatus, readonly VisitStatus[]> = {
  EXPECTED: ['ARRIVED', 'CHECKED_IN', 'CANCELLED'],
  ARRIVED: ['CHECKED_IN', 'CANCELLED'],
  CHECKED_IN: ['WAITING', 'IN_SERVICE', 'CANCELLED'],
  WAITING: ['IN_SERVICE', 'CANCELLED'],
  IN_SERVICE: ['SERVICE_COMPLETED'],
  SERVICE_COMPLETED: ['CHECKOUT_PENDING'],
  CHECKOUT_PENDING: ['CHECKED_OUT'],
  CHECKED_OUT: [],
  CANCELLED: [],
};

export function canTransitionVisit(
  from: VisitStatus,
  to: VisitStatus,
): boolean {
  return allowedTransitions[from].includes(to);
}

export function transitionTimestampColumn(
  status: VisitStatus,
):
  | 'arrivedAt'
  | 'checkedInAt'
  | 'serviceStartedAt'
  | 'serviceCompletedAt'
  | 'checkoutPendingAt'
  | 'checkedOutAt'
  | 'cancelledAt'
  | null {
  switch (status) {
    case 'ARRIVED':
      return 'arrivedAt';
    case 'CHECKED_IN':
      return 'checkedInAt';
    case 'IN_SERVICE':
      return 'serviceStartedAt';
    case 'SERVICE_COMPLETED':
      return 'serviceCompletedAt';
    case 'CHECKOUT_PENDING':
      return 'checkoutPendingAt';
    case 'CHECKED_OUT':
      return 'checkedOutAt';
    case 'CANCELLED':
      return 'cancelledAt';
    default:
      return null;
  }
}
