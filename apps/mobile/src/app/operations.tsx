import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useValooSession } from '@/lib/valoo-session';
import { valooRequest, ValooApiError } from '@/lib/valoo-api';

type ChecklistRun = {
  id: string;
  category: 'OPENING' | 'CLOSING';
  templateName: string;
  businessDate: string;
  status: 'OPEN' | 'COMPLETED';
};

type ChecklistPage = { data: ChecklistRun[]; meta: { page: number; limit: number; hasMore: boolean } };

type ChecklistDetail = ChecklistRun & {
  items: Array<{ id: string; title: string; status: 'PENDING' | 'COMPLETED' | 'NA'; isRequired: boolean }>;
};

function localDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function OperationsScreen() {
  const { session, me, expireSession } = useValooSession();
  const token = session?.accessToken ?? null;
  const permitted = session?.membership.permissions.includes('operations.read') ?? false;
  const branchId = me?.tenantContext.branchId ?? null;
  const hasBranch = Boolean(branchId);
  const [runs, setRuns] = useState<ChecklistRun[] | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [category, setCategory] = useState<'ALL' | 'OPENING' | 'CLOSING'>('ALL');
  const [periodDays, setPeriodDays] = useState<7 | 30 | 90>(30);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<ChecklistDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const detailRequestRef = useRef<AbortController | null>(null);
  const [loading, setLoading] = useState(false);
  const requestRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    if (!token || !permitted || !hasBranch) return;
    requestRef.current?.abort();
    detailRequestRef.current?.abort();
    detailRequestRef.current = null;
    setDetail(null);
    setDetailLoading(false);
    setDetailError(null);
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    setError(null);
    setRuns(null);
    try {
      const end = new Date();
      const start = new Date(end);
      start.setDate(start.getDate() - (periodDays - 1));
      const params = new URLSearchParams({ from: localDateString(start), to: localDateString(end) });
      if (category !== 'ALL') params.set('category', category);
      params.set('page', String(page));
      params.set('limit', '25');
      const path = `/operations/branch-checklists/runs?${params.toString()}`;
      const result = await valooRequest<ChecklistPage>(path, {
        accessToken: token,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      if (!Array.isArray(result.data) || result.meta?.page !== page || typeof result.meta?.hasMore !== 'boolean') throw new Error('Kontrol listesi yanıtı geçersiz.');
      setRuns(result.data);
      setHasMore(result.meta.hasMore);
    } catch (cause) {
      if (controller.signal.aborted) return;
      if (cause instanceof ValooApiError && cause.status === 401) expireSession();
      else setError(cause instanceof Error ? cause.message : 'Operasyon kayıtları yüklenemedi.');
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        setLoading(false);
      }
    }
  }, [token, permitted, branchId, category, periodDays, page, expireSession]);

  const showDetail = useCallback(async (runId: string) => {
    if (!token || !permitted || !hasBranch) return;
    detailRequestRef.current?.abort();
    const controller = new AbortController();
    detailRequestRef.current = controller;
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    try {
      const result = await valooRequest<ChecklistDetail>(
        `/operations/branch-checklists/runs/${encodeURIComponent(runId)}`,
        { accessToken: token, signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      if (result.id !== runId || !Array.isArray(result.items)) {
        throw new Error('Kontrol listesi detayı beklenen biçimde değil.');
      }
      setDetail(result);
    } catch (cause) {
      if (controller.signal.aborted) return;
      if (cause instanceof ValooApiError && cause.status === 401) expireSession();
      else setDetailError(cause instanceof Error ? cause.message : 'Detay yüklenemedi.');
    } finally {
      if (detailRequestRef.current === controller) {
        detailRequestRef.current = null;
        setDetailLoading(false);
      }
    }
  }, [token, permitted, branchId, expireSession]);

  useEffect(() => {
    if (token && permitted && hasBranch) void load();
    else {
      setRuns(null);
      setHasMore(false);
      setDetail(null);
      setError(null);
      setDetailError(null);
      setLoading(false);
      setDetailLoading(false);
    }
    return () => {
      requestRef.current?.abort();
      detailRequestRef.current?.abort();
    };
  }, [token, permitted, branchId, load]);

  useEffect(() => {
    setPage(1);
  }, [branchId, token]);

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.eyebrow}>OPERASYON MERKEZİ</Text>
        <Text style={styles.heading}>Şube kontrol listeleri</Text>
        <Text style={styles.intro}>Yalnızca aktif şubenizin açılış ve kapanış kayıtları görüntülenir.</Text>
        {!session ? (
          <View style={styles.card}><Text style={styles.body}>Operasyon kayıtları için giriş yapın.</Text></View>
        ) : !permitted ? (
          <View style={styles.card}><Text style={styles.body}>Operasyon görüntüleme yetkiniz bulunmuyor.</Text></View>
        ) : !hasBranch ? (
          <View style={styles.card}><Text style={styles.body}>Kayıtları görüntülemek için aktif şube bağlamı gerekli.</Text></View>
        ) : (
          <>
            <View style={styles.filterRow}>
              {([
                ['ALL', 'Tümü'],
                ['OPENING', 'Açılış'],
                ['CLOSING', 'Kapanış'],
              ] as const).map(([value, label]) => (
                <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: category === value }} onPress={() => { setPage(1); setCategory(value); }} style={[styles.filterButton, category === value && styles.filterSelected]}>
                  <Text style={styles.buttonText}>{label}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.filterRow}>
              {([7, 30, 90] as const).map((days) => (
                <Pressable key={days} accessibilityRole="button" accessibilityState={{ selected: periodDays === days }} onPress={() => { setPage(1); setPeriodDays(days); }} style={[styles.filterButton, periodDays === days && styles.filterSelected]}>
                  <Text style={styles.buttonText}>Son {days} gün</Text>
                </Pressable>
              ))}
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Şube kontrol listelerini yenile" disabled={loading} onPress={() => void load()} style={styles.button}>
              <Text style={styles.buttonText}>Listeyi yenile</Text>
            </Pressable>
            {loading && <ActivityIndicator color="#086ad8" accessibilityLabel="Kontrol listeleri yükleniyor" />}
            {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
            {runs?.length === 0 && <View style={styles.card}><Text style={styles.body}>Bu şubede kontrol listesi kaydı bulunamadı.</Text></View>}
            {runs?.map((run) => (
              <View key={run.id} style={styles.card}>
                <Text style={styles.title}>{run.templateName}</Text>
                <Text style={styles.body}>{run.category === 'OPENING' ? 'Açılış' : 'Kapanış'} · {run.status === 'COMPLETED' ? 'Tamamlandı' : 'Açık'}</Text>
                <Text style={styles.body}>İş günü: {run.businessDate.slice(0, 10)}</Text>
                <Pressable accessibilityRole="button" accessibilityLabel="Kontrol listesi detayını göster" onPress={() => void showDetail(run.id)} style={styles.button}>
                  <Text style={styles.buttonText}>Detayını görüntüle</Text>
                </Pressable>
              </View>
            ))}
            {detailLoading && <ActivityIndicator color="#086ad8" accessibilityLabel="Kontrol listesi detayı yükleniyor" />}
            {!!detailError && <Text accessibilityRole="alert" style={styles.error}>{detailError}</Text>}
            {detail && (
              <View style={styles.card}>
                <Text style={styles.title}>{detail.templateName} — Detay</Text>
                {detail.items.length === 0 && <Text style={styles.body}>Kontrol maddesi bulunamadı.</Text>}
                {detail.items.map((item) => (
                  <View key={item.id} style={styles.detailRow}>
                    <Text style={styles.body}>{item.title}</Text>
                    <Text style={styles.note}>{item.status === 'COMPLETED' ? 'Tamamlandı' : item.status === 'NA' ? 'Uygulanmaz' : 'Bekliyor'}{item.isRequired ? ' · Zorunlu' : ''}</Text>
                  </View>
                ))}
              </View>
            )}
            {runs && (
              <View style={styles.filterRow}>
                <Pressable accessibilityRole="button" disabled={loading || page === 1} onPress={() => setPage((current) => Math.max(1, current - 1))} style={styles.filterButton}>
                  <Text style={styles.buttonText}>Önceki</Text>
                </Pressable>
                <Text style={styles.body}>Sayfa {page}</Text>
                <Pressable accessibilityRole="button" disabled={loading || !hasMore} onPress={() => setPage((current) => current + 1)} style={styles.filterButton}>
                  <Text style={styles.buttonText}>Sonraki</Text>
                </Pressable>
              </View>
            )}
            {!!runs?.length && <Text style={styles.note}>Sayfa başına 25 kayıt gösterilir. Bu ekran yalnızca görüntüleme amaçlıdır.</Text>}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f2f6fc' },
  container: { padding: 22, paddingBottom: 80, gap: 16 },
  eyebrow: { color: '#086ad8', fontSize: 11, fontWeight: '700', letterSpacing: 1.5 },
  heading: { color: '#162d4e', fontSize: 25, fontWeight: '800' },
  intro: { color: '#586e89', lineHeight: 21, fontSize: 14 },
  card: { padding: 18, backgroundColor: '#fff', borderRadius: 17, borderWidth: 1, borderColor: '#e1e9f5', gap: 9 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filterButton: { backgroundColor: '#fff', borderRadius: 10, padding: 11 },
  filterSelected: { backgroundColor: '#cde3ff' },
  detailRow: { borderTopWidth: 1, borderTopColor: '#e1e9f5', paddingTop: 10, gap: 3 },
  title: { color: '#1b3453', fontSize: 16, fontWeight: '700' },
  body: { color: '#4a6280', fontSize: 14, lineHeight: 20 },
  note: { color: '#6c7d96', fontSize: 12, lineHeight: 19 },
  button: { backgroundColor: '#e3efff', borderRadius: 12, padding: 13, alignItems: 'center' },
  buttonText: { color: '#086ad8', fontSize: 14, fontWeight: '700' },
  error: { color: '#a52424', padding: 12, backgroundColor: '#fef0ef', borderRadius: 10 },
});
