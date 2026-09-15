export const reportKeys = {
  staffPerformance: 'staff.performance',
  servicePerformance: 'service.performance',
  paymentSummary: 'payments.summary',
} as const;

export type ReportKey = (typeof reportKeys)[keyof typeof reportKeys];

export type ReportPermission = Readonly<{
  resource: string;
  action: string;
}>;

export type ReportDefinition = Readonly<{
  key: ReportKey;
  title: string;
  description: string;
  domain: 'staff' | 'services' | 'payments';
  route: string;
  requiredPermissions: readonly ReportPermission[];
  filters: readonly string[];
}>;

export const reportDefinitions: readonly ReportDefinition[] = Object.freeze([
  {
    key: reportKeys.staffPerformance,
    title: 'Personel Performansı',
    description: 'Personel bazında randevu, tamamlanma ve tahsilat performansı.',
    domain: 'staff',
    route: '/staff/performance',
    requiredPermissions: [
      { resource: 'reports', action: 'read' },
      { resource: 'staff', action: 'read' },
    ],
    filters: ['from', 'to'],
  },
  {
    key: reportKeys.servicePerformance,
    title: 'Hizmet Performansı',
    description: 'Hizmet bazında performans görünümü.',
    domain: 'services',
    route: '/services/performance',
    requiredPermissions: [
      { resource: 'reports', action: 'read' },
      { resource: 'services', action: 'read' },
    ],
    filters: ['from', 'to'],
  },
  {
    key: reportKeys.paymentSummary,
    title: 'Ödeme Raporu',
    description: 'Ödeme ve tahsilat performansı görünümü.',
    domain: 'payments',
    route: '/payments/summary',
    requiredPermissions: [
      { resource: 'reports', action: 'read' },
      { resource: 'payments', action: 'read' },
    ],
    filters: ['from', 'to'],
  },
]);
