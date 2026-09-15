export const reportKeys = {
  staffPerformance: 'staff.performance',
  servicePerformance: 'service.performance',
  paymentSummary: 'payments.summary',
} as const;

export type ReportKey = (typeof reportKeys)[keyof typeof reportKeys];
export type ReportExportFormat = 'PDF' | 'XLSX' | 'CSV';

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
  resultKind: 'table' | 'summary';
  requiredPermissions: readonly ReportPermission[];
  filters: readonly string[];
  availableColumns: readonly string[];
  defaultColumns: readonly string[];
  exportableColumns: readonly string[];
  sortableColumns: readonly string[];
  exportFormats: readonly ReportExportFormat[];
  pagination: boolean;
}>;

export const reportDefinitions: readonly ReportDefinition[] = Object.freeze([
  {
    key: reportKeys.staffPerformance,
    title: 'Personel Performansı',
    description: 'Personel bazında randevu, tamamlanma ve tahsilat performansı.',
    domain: 'staff',
    route: '/staff/performance',
    resultKind: 'table',
    requiredPermissions: [
      { resource: 'reports', action: 'read' },
      { resource: 'staff', action: 'read' },
    ],
    filters: ['from', 'to'],
    availableColumns: [
      'name',
      'status',
      'branchId',
      'appointmentCount',
      'completedAppointments',
      'completionRate',
      'collected',
    ],
    defaultColumns: [
      'name',
      'appointmentCount',
      'completedAppointments',
      'completionRate',
      'collected',
    ],
    exportableColumns: [
      'name',
      'status',
      'appointmentCount',
      'completedAppointments',
      'completionRate',
      'collected',
    ],
    sortableColumns: [
      'name',
      'appointmentCount',
      'completedAppointments',
      'completionRate',
      'collected',
    ],
    exportFormats: ['CSV'],
    pagination: true,
  },
  {
    key: reportKeys.servicePerformance,
    title: 'Hizmet Performansı',
    description: 'Hizmet bazında performans görünümü.',
    domain: 'services',
    route: '/services/performance',
    resultKind: 'table',
    requiredPermissions: [
      { resource: 'reports', action: 'read' },
      { resource: 'services', action: 'read' },
    ],
    filters: ['from', 'to'],
    availableColumns: [
      'name',
      'price',
      'status',
      'branchId',
      'appointmentCount',
      'completedAppointments',
      'completionRate',
      'collected',
    ],
    defaultColumns: [
      'name',
      'appointmentCount',
      'completedAppointments',
      'completionRate',
      'collected',
    ],
    exportableColumns: [
      'name',
      'price',
      'status',
      'appointmentCount',
      'completedAppointments',
      'completionRate',
      'collected',
    ],
    sortableColumns: [
      'name',
      'appointmentCount',
      'completedAppointments',
      'completionRate',
      'collected',
    ],
    exportFormats: ['CSV'],
    pagination: true,
  },
  {
    key: reportKeys.paymentSummary,
    title: 'Ödeme Raporu',
    description: 'Ödeme ve tahsilat performansı görünümü.',
    domain: 'payments',
    route: '/payments/summary',
    resultKind: 'summary',
    requiredPermissions: [
      { resource: 'reports', action: 'read' },
      { resource: 'payments', action: 'read' },
    ],
    filters: ['from', 'to'],
    availableColumns: [
      'gross',
      'refunds',
      'net',
      'paymentCount',
      'refundCount',
      'methods',
    ],
    defaultColumns: [
      'gross',
      'refunds',
      'net',
      'paymentCount',
      'refundCount',
      'methods',
    ],
    exportableColumns: [
      'gross',
      'refunds',
      'net',
      'paymentCount',
      'refundCount',
      'methods',
    ],
    sortableColumns: [],
    exportFormats: ['CSV'],
    pagination: false,
  },
]);

export function getReportDefinition(key: ReportKey) {
  return reportDefinitions.find((report) => report.key === key);
}
