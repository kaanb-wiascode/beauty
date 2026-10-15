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

export default function OperationsScreen() {
  const { session, me, expireSession } = useValooSession();
  const token = session?.accessToken ?? null;
  const permitted = session?.membership.permissions.includes('operations.read') ?? false;
  const hasBranch = Boolean(me?.tenantContext.branchId);
  const [runs, setRuns] = useState<ChecklistRun[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const requestRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    if (!token || !permitted || !hasBranch) return;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    setError(null);
    setRuns(null);
    try {
      const result = await valooRequest<ChecklistRun[]>('/operations/branch-checklists/runs', {
        accessToken: token,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      if (!Array.isArray(result)) throw new Error('Kontrol listesi yanıtı geçersiz.');
      setRuns(result.slice(0, 50));
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
  }, [token, permitted, hasBranch, expireSession]);

  useEffect(() => {
    if (token && permitted && hasBranch) void load();
    else {
      setRuns(null);
      setError(null);
      setLoading(false);
    }
    return () => requestRef.current?.abort();
  }, [token, permitted, hasBranch, load]);

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
              </View>
            ))}
            {!!runs?.length && <Text style={styles.note}>En fazla ilk 50 kayıt gösterilir. Bu ekran yalnızca görüntüleme amaçlıdır.</Text>}
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
  title: { color: '#1b3453', fontSize: 16, fontWeight: '700' },
  body: { color: '#4a6280', fontSize: 14, lineHeight: 20 },
  note: { color: '#6c7d96', fontSize: 12, lineHeight: 19 },
  button: { backgroundColor: '#e3efff', borderRadius: 12, padding: 13, alignItems: 'center' },
  buttonText: { color: '#086ad8', fontSize: 14, fontWeight: '700' },
  error: { color: '#a52424', padding: 12, backgroundColor: '#fef0ef', borderRadius: 10 },
});
