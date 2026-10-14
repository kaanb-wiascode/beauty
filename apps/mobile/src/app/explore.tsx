import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  appointmentsPath,
  canReadAppointments,
  valooRequest,
  ValooApiError,
  type AppointmentSummary,
  type AppointmentRangeDays,
  type AppointmentStatus,
  type AppointmentsPage,
} from '@/lib/valoo-api';
import { useValooSession } from '@/lib/valoo-session';

const STATUS_LABEL: Record<AppointmentSummary['status'], string> = {
  SCHEDULED: 'Planlandı',
  CONFIRMED: 'Onaylandı',
  COMPLETED: 'Tamamlandı',
  CANCELLED: 'İptal edildi',
  NO_SHOW: 'Gelmedi',
};

function prettyDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Geçersiz tarih';
  return date.toLocaleString('tr-TR', {
    day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function AppointmentCard({ item }: { item: AppointmentSummary }) {
  const customerName = item.customer
    ? [item.customer.firstName, item.customer.lastName].filter(Boolean).join(' ')
    : 'Müşteri bilgisi bulunamadı';
  const staffName = item.staff
    ? [item.staff.firstName, item.staff.lastName].filter(Boolean).join(' ')
    : 'Personel bilgisi bulunamadı';
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <Text style={styles.cardName}>{customerName}</Text>
        <Text style={styles.status}>{STATUS_LABEL[item.status] ?? item.status}</Text>
      </View>
      <Text style={styles.serviceName}>{item.service?.name ?? 'Hizmet bilgisi bulunamadı'}</Text>
      <Text style={styles.appointmentDate}>{prettyDate(item.startAt)}</Text>
      <Text style={styles.subdued}>Bitiş: {prettyDate(item.endAt)}</Text>
      <Text style={styles.subdued}>Personel: {staffName}</Text>
      <Text style={styles.subdued}>Şube: {item.branch?.name ?? 'Şube bilgisi bulunamadı'}</Text>
    </View>
  );
}

export default function AppointmentsScreen() {
  const { session, expireSession } = useValooSession();
  const token = session?.accessToken ?? null;
  const permitted = session ? canReadAppointments(session.membership) : false;
  const [page, setPage] = useState(1);
  const [rangeDays, setRangeDays] = useState<AppointmentRangeDays>(7);
  const [statusFilter, setStatusFilter] = useState<AppointmentStatus | null>(null);
  const [data, setData] = useState<AppointmentsPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    if (!token || !permitted) return;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    setMessage(null);
    setData(null);
    try {
      const result = await valooRequest<AppointmentsPage>(
        appointmentsPath(page, { days: rangeDays, status: statusFilter }), {
        accessToken: token,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      if (!Array.isArray(result.data) || !result.meta) {
        throw new Error('Randevu yanıtı beklenen biçimde değil.');
      }
      setData(result);
    } catch (cause) {
      if (controller.signal.aborted) return;
      setData(null);
      if (cause instanceof ValooApiError && cause.status === 401) {
        expireSession();
      } else {
        setMessage(cause instanceof Error ? cause.message : 'Randevular yüklenemedi.');
      }
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        setLoading(false);
      }
    }
  }, [token, permitted, page, rangeDays, statusFilter, expireSession]);

  useEffect(() => {
    if (token && permitted) {
      void load();
    } else {
      requestRef.current?.abort();
      setData(null);
      setPage(1);
      setLoading(false);
    }
    return () => requestRef.current?.abort();
  }, [token, permitted, load]);

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.eyebrow}>OPERASYON MERKEZİ</Text>
        <Text style={styles.heading}>Randevular</Text>
        <Text style={styles.intro}>Randevular doğrudan VALOO sunucusundan, yalnızca yetki kapsamınızda görüntülenir.</Text>

        {!session ? (
          <View style={styles.note}>
            <Text style={styles.noteTitle}>Oturum gerekli</Text>
            <Text style={styles.noteText}>Randevulara erişmek için Ana Sayfa sekmesinden giriş yapın.</Text>
          </View>
        ) : !permitted ? (
          <View style={styles.note}>
            <Text style={styles.noteTitle}>Görüntüleme yetkisi bulunmuyor</Text>
            <Text style={styles.noteText}>Hesabınıza randevu görüntüleme yetkisi tanımlı değil. Yetki değişiklikleri sunucuda uygulanır.</Text>
          </View>
        ) : (
          <>
            <Text style={styles.fieldHeading}>Tarih aralığı</Text>
            <View style={styles.filters}>
              {([{ days: 1, label: 'Bugün' }, { days: 7, label: '7 gün' }, { days: 30, label: '30 gün' }] as const).map(({ days, label }) => (
                <Pressable
                  key={days}
                  accessibilityRole="button"
                  accessibilityState={{ selected: rangeDays === days }}
                  onPress={() => { setRangeDays(days); setPage(1); }}
                  style={[styles.filterButton, rangeDays === days && styles.selectedFilter]}>
                  <Text style={[styles.filterText, rangeDays === days && styles.selectedFilterText]}>{label}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.fieldHeading}>Durum</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
              {([
                { value: null, label: 'Tümü' },
                ...Object.entries(STATUS_LABEL).map(([value, label]) => ({ value: value as AppointmentStatus, label })),
              ] as { value: AppointmentStatus | null; label: string }[]).map(({ value, label }) => (
                <Pressable
                  key={value ?? 'ALL'}
                  accessibilityRole="button"
                  accessibilityState={{ selected: statusFilter === value }}
                  onPress={() => { setStatusFilter(value); setPage(1); }}
                  style={[styles.filterButton, statusFilter === value && styles.selectedFilter]}>
                  <Text style={[styles.filterText, statusFilter === value && styles.selectedFilterText]}>{label}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <View style={styles.toolbar}>
              <Text style={styles.total}>{data ? `${data.meta.total} kayıt` : 'Randevu listesi'}</Text>
              <Pressable accessibilityRole="button" disabled={loading} onPress={() => void load()} style={styles.refresh}>
                <Text style={styles.refreshText}>Yenile</Text>
              </Pressable>
            </View>
            {loading && <ActivityIndicator style={styles.loading} color="#086ad8" />}
            {!!message && <Text accessibilityRole="alert" style={styles.error}>{message}</Text>}
            {!loading && data?.data.length === 0 && (
              <View style={styles.note}>
                <Text style={styles.noteTitle}>Randevu bulunamadı</Text>
                <Text style={styles.noteText}>Bu tarih aralığında ve yetki kapsamınızda kayıt bulunmuyor.</Text>
              </View>
            )}
            {data?.data.map((item) => <AppointmentCard key={item.id} item={item} />)}
            {data && data.meta.totalPages > 1 && (
              <View style={styles.pagination}>
                <Pressable
                  accessibilityRole="button"
                  disabled={loading || page <= 1}
                  onPress={() => setPage((value) => Math.max(1, value - 1))}
                  style={[styles.pageButton, (loading || page <= 1) && styles.disabled]}>
                  <Text style={styles.pageText}>Önceki</Text>
                </Pressable>
                <Text style={styles.pageCount}>{page} / {data.meta.totalPages}</Text>
                <Pressable
                  accessibilityRole="button"
                  disabled={loading || page >= data.meta.totalPages}
                  onPress={() => setPage((value) => value + 1)}
                  style={[styles.pageButton, (loading || page >= data.meta.totalPages) && styles.disabled]}>
                  <Text style={styles.pageText}>Sonraki</Text>
                </Pressable>
              </View>
            )}
            <Text style={styles.disclaimer}>Bu sürüm salt okunurdur. Oluşturma, iptal ve tahsilat işlemleri etkin değildir.</Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f2f6fc' },
  container: { gap: 14, padding: 22, paddingBottom: 88 },
  eyebrow: { color: '#086ad8', fontSize: 11, letterSpacing: 1.5, fontWeight: '700' },
  heading: { fontSize: 27, fontWeight: '800', color: '#162d4e' },
  intro: { color: '#5b6f89', fontSize: 14, lineHeight: 21, marginBottom: 7 },
  toolbar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  total: { color: '#243c5b', fontWeight: '700', fontSize: 14 },
  refresh: { backgroundColor: '#e3efff', borderRadius: 10, paddingHorizontal: 15, paddingVertical: 10 },
  refreshText: { color: '#076bd6', fontWeight: '700', fontSize: 13 },
  loading: { marginVertical: 22 },
  card: { padding: 16, gap: 7, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e1e9f5', borderRadius: 16 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  cardName: { color: '#1c3553', fontWeight: '700', fontSize: 14, flex: 1 },
  status: { color: '#076bd6', backgroundColor: '#ebf3fe', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, overflow: 'hidden', fontSize: 11 },
  serviceName: { color: '#086ad8', fontWeight: '600', fontSize: 13 },
  fieldHeading: { color: '#3d5778', fontSize: 12, fontWeight: '700', marginTop: 6 },
  filters: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 12 },
  filterButton: { paddingHorizontal: 13, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#d7e2f2', backgroundColor: '#ffffff' },
  selectedFilter: { backgroundColor: '#086ad8', borderColor: '#086ad8' },
  filterText: { fontSize: 12, color: '#49627f', fontWeight: '600' },
  selectedFilterText: { color: '#ffffff' },
  appointmentDate: { color: '#162d4e', fontWeight: '700', fontSize: 16 },
  subdued: { color: '#697d96', fontSize: 12 },
  note: { borderWidth: 1, borderColor: '#d8e7fa', borderRadius: 16, padding: 20, backgroundColor: '#ffffff', gap: 10 },
  noteTitle: { color: '#244468', fontSize: 18, fontWeight: '700' },
  noteText: { color: '#64748b', lineHeight: 21, fontSize: 14 },
  error: { color: '#a52424', padding: 12, backgroundColor: '#fef0ef', borderRadius: 10, fontSize: 13 },
  pagination: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 7 },
  pageButton: { backgroundColor: '#e6effc', borderRadius: 10, padding: 12 },
  disabled: { opacity: 0.45 },
  pageText: { color: '#095cbd', fontWeight: '700' },
  pageCount: { color: '#3a5575', fontSize: 13 },
  disclaimer: { color: '#73859f', textAlign: 'center', lineHeight: 19, fontSize: 11, marginTop: 8 },
});
