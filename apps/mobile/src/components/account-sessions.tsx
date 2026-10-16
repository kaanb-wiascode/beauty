import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ValooApiError, valooRequest, type LoginSession } from '@/lib/valoo-api';
import { useValooSession } from '@/lib/valoo-session';

type ActiveSession = {
  id: string;
  membershipId: string;
  companyId: string | null;
  branchId: string | null;
  roleScope: string | null;
  createdAt: string;
  rotatedAt: string;
  expiresInSeconds: number | null;
};

function dateLabel(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? 'Bilinmiyor'
    : parsed.toLocaleString('tr-TR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
}

function isSessionList(value: unknown): value is ActiveSession[] {
  return Array.isArray(value) && value.every((item) =>
    item !== null &&
    typeof item === 'object' &&
    typeof item.id === 'string' &&
    /^[a-f0-9]{64}$/.test(item.id) &&
    typeof item.createdAt === 'string' &&
    typeof item.rotatedAt === 'string',
  );
}

export function AccountSessions({ session }: { session: LoginSession }) {
  const { expireSession } = useValooSession();
  const [sessions, setSessions] = useState<ActiveSession[] | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const result = await valooRequest<unknown>('/auth/sessions', {
        accessToken: session.accessToken,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      if (!isSessionList(result)) {
        throw new Error('Oturum listesi beklenen biçimde değil.');
      }
      setSessions(result);
    } catch (cause) {
      if (controller.signal.aborted) return;
      setSessions(null);
      if (cause instanceof ValooApiError && cause.status === 401) {
        expireSession();
      } else {
        setError(cause instanceof Error ? cause.message : 'Oturumlar yüklenemedi.');
      }
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        setLoading(false);
      }
    }
  }, [session.accessToken, expireSession]);

  useEffect(() => {
    void load();
    return () => requestRef.current?.abort();
  }, [load]);

  async function revoke(id: string) {
    if (revokingId || id === session.sessionId || pendingId !== id) return;
    setRevokingId(id);
    setError(null);
    try {
      const response = await valooRequest<{ id: string; revoked: boolean }>(
        `/auth/sessions/${encodeURIComponent(id)}/revoke`,
        { method: 'POST', accessToken: session.accessToken },
      );
      if (response.id !== id || response.revoked !== true) {
        throw new Error('Oturum iptali doğrulanamadı.');
      }
      setPendingId(null);
      await load();
    } catch (cause) {
      if (cause instanceof ValooApiError && cause.status === 401) {
        expireSession();
      } else {
        setError(cause instanceof Error ? cause.message : 'Oturum iptal edilemedi.');
      }
    } finally {
      setRevokingId(null);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.headingRow}>
        <Text style={styles.heading}>Aktif Oturumlar</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Oturum listesini yenile"
          onPress={() => void load()}
          disabled={loading || !!revokingId}
          style={[styles.refresh, (loading || !!revokingId) && styles.disabled]}>
          <Text style={styles.refreshText}>Yenile</Text>
        </Pressable>
      </View>
      <Text style={styles.explainer}>
        Hesabınızın bu işletmedeki oturumlarını inceleyin. Tanımadığınız oturumları iptal edebilirsiniz.
      </Text>
      {loading && <ActivityIndicator color="#086ad8" accessibilityLabel="Oturumlar yükleniyor" />}
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      {sessions?.length === 0 && !loading && (
        <Text style={styles.muted}>Listelenebilecek aktif oturum bulunamadı.</Text>
      )}
      {sessions?.map((item) => {
        const own = item.id === session.sessionId;
        const confirming = pendingId === item.id;
        const revoking = revokingId === item.id;
        return (
          <View key={item.id} style={styles.session}>
            <View style={styles.sessionRow}>
              <Text style={styles.sessionTitle}>{own ? 'Bu oturum' : 'Diğer oturum'}</Text>
              {own && <Text style={styles.current}>Aktif</Text>}
            </View>
            <Text style={styles.detail}>Açılış: {dateLabel(item.createdAt)}</Text>
            <Text style={styles.detail}>Son yenileme: {dateLabel(item.rotatedAt)}</Text>
            {own ? (
              <Text style={styles.muted}>Bu oturumu kapatmak için yukarıdaki çıkış düğmesini kullanın.</Text>
            ) : confirming ? (
              <View style={styles.actions}>
                <Pressable
                  accessibilityRole="button"
                  disabled={!!revokingId}
                  onPress={() => void revoke(item.id)}
                  style={[styles.dangerButton, !!revokingId && styles.disabled]}>
                  <Text style={styles.dangerText}>{revoking ? 'İptal ediliyor…' : 'Evet, iptal et'}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={!!revokingId}
                  onPress={() => setPendingId(null)}
                  style={styles.cancelButton}>
                  <Text style={styles.cancelText}>Vazgeç</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                accessibilityRole="button"
                disabled={!!revokingId || loading}
                onPress={() => setPendingId(item.id)}
                style={[styles.revokeButton, (!!revokingId || loading) && styles.disabled]}>
                <Text style={styles.revokeText}>Bu oturumu iptal et</Text>
              </Pressable>
            )}
          </View>
        );
      })}
      <Text style={styles.muted}>
        Oturum iptali sunucuda uygulanır ve ilgili oturumun mevcut erişim belirtecini de geçersiz kılar.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderTopWidth: 1, borderColor: '#e2eaf4', paddingTop: 17, gap: 11, marginTop: 5 },
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  heading: { fontSize: 17, fontWeight: '700', color: '#132844', flex: 1 },
  explainer: { color: '#5d708b', lineHeight: 19, fontSize: 12 },
  refresh: { backgroundColor: '#eef4fd', borderRadius: 9, paddingHorizontal: 11, paddingVertical: 8 },
  refreshText: { color: '#086ad8', fontWeight: '700', fontSize: 12 },
  error: { color: '#a52424', padding: 10, backgroundColor: '#fff1f0', borderRadius: 9, fontSize: 12 },
  session: { borderRadius: 13, backgroundColor: '#f5f8fc', borderWidth: 1, borderColor: '#e1e9f5', padding: 13, gap: 7 },
  sessionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  sessionTitle: { fontWeight: '700', fontSize: 13, color: '#253a5b' },
  current: { fontSize: 11, fontWeight: '600', color: '#086ad8', backgroundColor: '#e7f0fe', overflow: 'hidden', borderRadius: 7, padding: 6 },
  detail: { fontSize: 12, color: '#536987' },
  muted: { fontSize: 11, lineHeight: 17, color: '#71839c' },
  revokeButton: { borderWidth: 1, borderColor: '#efc6c4', borderRadius: 9, padding: 11, alignItems: 'center', marginTop: 4 },
  revokeText: { color: '#b42318', fontWeight: '700', fontSize: 12 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 5 },
  dangerButton: { flex: 1, borderRadius: 9, padding: 11, alignItems: 'center', backgroundColor: '#b42318' },
  dangerText: { color: '#ffffff', fontWeight: '700', fontSize: 12 },
  cancelButton: { flex: 1, borderRadius: 9, padding: 11, alignItems: 'center', backgroundColor: '#e8eff8' },
  cancelText: { color: '#2d4968', fontWeight: '700', fontSize: 12 },
  disabled: { opacity: 0.48 },
});
