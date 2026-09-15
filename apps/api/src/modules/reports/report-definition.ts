export const reportKeys = {
  staffPerformance: 'staff.performance',
  servicePerformance: 'service.performance',
  paymentSummary: 'payments.summary',
  customerPerformance: 'customers.performance',
  salesPerformance: 'sales.performance',
  appointmentPerformance: 'appointments.performance',
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
  domain: 'staff' | 'services' | 'payments' | 'customers' | 'sales' | 'appointments';
  route: string;
  resultKind: 'table' | 'summary';
  requiredPermissions: readonly ReportPermission[];
  filters: readonly string[];
  availableColumns: readonly string[];
  defaultColumns: readonly string[];
  exportableColumns: readonly string[];
  sortableColumns: readonly string[];
  exportFormats: readonly ReportExportFormat[];
  drilldowns: readonly string[];
  pagination: boolean;
}>;

export const reportDefinitions: readonly ReportDefinition[] = Object.freeze([
  {
    key: reportKeys.staffPerformance,
    title: 'Personel Performansı',
    description: 'Personel bazında randevu, tamamlanma ve tahsilat performansı.',
    domain: 'staff', route: '/staff/performance', resultKind: 'table',
    requiredPermissions: [{ resource: 'reports', action: 'read' }, { resource: 'staff', action: 'read' }],
    filters: ['from', 'to'],
    availableColumns: ['name','status','branchId','appointmentCount','completedAppointments','completionRate','collected'],
    defaultColumns: ['name','appointmentCount','completedAppointments','completionRate','collected'],
    exportableColumns: ['name','status','appointmentCount','completedAppointments','completionRate','collected'],
    sortableColumns: ['name','appointmentCount','completedAppointments','completionRate','collected'],
    exportFormats: ['CSV', 'XLSX', 'PDF'], drilldowns: ['appointments'], pagination: true,
  },
  {
    key: reportKeys.servicePerformance,
    title: 'Hizmet Performansı', description: 'Hizmet bazında performans görünümü.',
    domain: 'services', route: '/services/performance', resultKind: 'table',
    requiredPermissions: [{ resource: 'reports', action: 'read' }, { resource: 'services', action: 'read' }],
    filters: ['from', 'to'],
    availableColumns: ['name','price','status','branchId','appointmentCount','completedAppointments','completionRate','collected'],
    defaultColumns: ['name','appointmentCount','completedAppointments','completionRate','collected'],
    exportableColumns: ['name','price','status','appointmentCount','completedAppointments','completionRate','collected'],
    sortableColumns: ['name','appointmentCount','completedAppointments','completionRate','collected'],
    exportFormats: ['CSV', 'XLSX', 'PDF'], drilldowns: ['appointments'], pagination: true,
  },
  {
    key: reportKeys.paymentSummary,
    title: 'Ödeme Raporu', description: 'Ödeme ve tahsilat performansı görünümü.',
    domain: 'payments', route: '/payments/summary', resultKind: 'summary',
    requiredPermissions: [{ resource: 'reports', action: 'read' }, { resource: 'payments', action: 'read' }],
    filters: ['from', 'to'],
    availableColumns: ['gross','refunds','net','paymentCount','refundCount','methods'],
    defaultColumns: ['gross','refunds','net','paymentCount','refundCount','methods'],
    exportableColumns: ['gross','refunds','net','paymentCount','refundCount','methods'],
    sortableColumns: [], exportFormats: ['CSV', 'XLSX', 'PDF'], drilldowns: [], pagination: false,
  },
  {
    key: reportKeys.customerPerformance,
    title: 'Müşteri Performansı', description: 'Müşteri bazında ziyaret ve tahsilat performansı.',
    domain: 'customers', route: '/customers/performance', resultKind: 'table',
    requiredPermissions: [{ resource: 'reports', action: 'read' }, { resource: 'customers', action: 'read' }],
    filters: ['from', 'to'],
    availableColumns: ['name','customerSource','customerSince','visitCount','completedVisits','firstVisitAt','lastVisitAt','collected','averageCollectedPerVisit'],
    defaultColumns: ['name','visitCount','completedVisits','lastVisitAt','collected','averageCollectedPerVisit'],
    exportableColumns: ['name','customerSource','customerSince','visitCount','completedVisits','firstVisitAt','lastVisitAt','collected','averageCollectedPerVisit'],
    sortableColumns: ['name','customerSince','visitCount','completedVisits','firstVisitAt','lastVisitAt','collected','averageCollectedPerVisit'],
    exportFormats: ['CSV', 'XLSX', 'PDF'], drilldowns: [], pagination: true,
  },
  {
    key: reportKeys.salesPerformance,
    title: 'Satış Performansı', description: 'Onaylanmış satışlarda ciro, tahsilat, iade ve açık bakiye görünümü.',
    domain: 'sales', route: '/sales/performance', resultKind: 'table',
    requiredPermissions: [{ resource: 'reports', action: 'read' }, { resource: 'payments', action: 'read' }],
    filters: ['from', 'to'],
    availableColumns: ['confirmedAt','customerName','subtotal','discountTotal','revenue','collected','refunded','netCollected','outstanding','itemCount','serviceQuantity','packageQuantity'],
    defaultColumns: ['confirmedAt','customerName','revenue','collected','refunded','outstanding','itemCount'],
    exportableColumns: ['confirmedAt','customerName','subtotal','discountTotal','revenue','collected','refunded','netCollected','outstanding','itemCount','serviceQuantity','packageQuantity'],
    sortableColumns: ['confirmedAt','customerName','subtotal','discountTotal','revenue','collected','refunded','netCollected','outstanding','itemCount','serviceQuantity','packageQuantity'],
    exportFormats: ['CSV', 'XLSX', 'PDF'], drilldowns: [], pagination: true,
  },
  {
    key: reportKeys.appointmentPerformance,
    title: 'Randevu Performansı',
    description: 'Gün bazında tamamlanma, iptal, no-show, müşteri davranışı ve talep yoğunluğu.',
    domain: 'appointments', route: '/appointments/performance', resultKind: 'table',
    requiredPermissions: [{ resource: 'reports', action: 'read' }, { resource: 'appointments', action: 'read' }],
    filters: ['from', 'to'],
    availableColumns: ['date','appointmentCount','scheduledCount','confirmedCount','completedCount','cancelledCount','noShowCount','completionRate','cancellationRate','noShowRate','uniqueCustomerCount','newCustomerCount','repeatCustomerCount','rebookedCustomerCount','rebookingRate','collected','averageDurationMinutes','peakHour'],
    defaultColumns: ['date','appointmentCount','completedCount','cancelledCount','noShowCount','completionRate','newCustomerCount','repeatCustomerCount','rebookingRate','peakHour'],
    exportableColumns: ['date','appointmentCount','scheduledCount','confirmedCount','completedCount','cancelledCount','noShowCount','completionRate','cancellationRate','noShowRate','uniqueCustomerCount','newCustomerCount','repeatCustomerCount','rebookedCustomerCount','rebookingRate','collected','averageDurationMinutes','peakHour'],
    sortableColumns: ['date','appointmentCount','scheduledCount','confirmedCount','completedCount','cancelledCount','noShowCount','completionRate','cancellationRate','noShowRate','uniqueCustomerCount','newCustomerCount','repeatCustomerCount','rebookedCustomerCount','rebookingRate','collected','averageDurationMinutes','peakHour'],
    exportFormats: ['CSV', 'XLSX', 'PDF'], drilldowns: [], pagination: true,
  },
]);

export function getReportDefinition(key: ReportKey) {
  return reportDefinitions.find((report) => report.key === key);
}
