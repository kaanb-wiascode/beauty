import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useValooSession } from '@/lib/valoo-session';
import { valooRequest, ValooApiError } from '@/lib/valoo-api';

type MobileProfile = {
  id: string;
  firstName: string;
  lastName: string;
  status: string;
  branch: { id: string; name: string } | null;
};

type TeamMember = MobileProfile;
type MobileTeam = { data: TeamMember[] };

export default function PersonnelScreen() {
  const { session, expireSession } = useValooSession();
  const token = session?.accessToken ?? null;
  const permitted = session?.membership.permissions.includes('hr_self_service.read') ?? false;
  const [profile, setProfile] = useState<MobileProfile | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const [team, setTeam] = useState<TeamMember[] | null>(null);
  const [teamMessage, setTeamMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!token || !permitted) return;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    const signal = controller.signal;
    setLoading(true);
    setMessage(null);
    setProfile(null);
    setTeam(null);
    setTeamMessage(null);
    try {
      const result = await valooRequest<MobileProfile>('/hr/self-service/me/mobile-profile', {
        accessToken: token,
        signal,
      });
      if (signal.aborted) return;
      if (!result.id || typeof result.firstName !== 'string' || typeof result.lastName !== 'string') {
        throw new Error('Personel bilgileri beklenen biçimde değil.');
      }
      setProfile(result);
      try {
        const teamResult = await valooRequest<MobileTeam>('/hr/self-service/manager/mobile-team', {
          accessToken: token,
          signal,
        });
        if (!signal.aborted) {
          if (!Array.isArray(teamResult.data)) throw new Error('Ekip bilgileri beklenen biçimde değil.');
          setTeam(teamResult.data);
        }
      } catch (teamError) {
        if (signal.aborted) return;
        if (teamError instanceof ValooApiError && teamError.status === 401) {
          expireSession();
          return;
        }
        setTeamMessage(teamError instanceof Error ? teamError.message : 'Ekip bilgileri yüklenemedi.');
      }
    } catch (error) {
      if (signal.aborted) return;
      if (error instanceof ValooApiError && error.status === 401) expireSession();
      else setMessage(error instanceof Error ? error.message : 'Personel bilgileri yüklenemedi.');
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        setLoading(false);
      }
    }
  }, [token, permitted, expireSession]);

  useEffect(() => {
    if (token && permitted) void load();
    else {
      setProfile(null);
      setTeam(null);
      setTeamMessage(null);
      setMessage(null);
    }
    return () => requestRef.current?.abort();
  }, [token, permitted, load]);

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.eyebrow}>VALOO PERSONEL</Text>
        <Text style={styles.heading}>Personel bilgilerim</Text>
        <Text style={styles.intro}>Bilgileriniz, oturumunuz ve yetkili olduğunuz şirket kapsamında sunucudan alınır.</Text>
        {!session ? (
          <View style={styles.card}><Text style={styles.title}>Oturum gerekli</Text><Text style={styles.body}>Bilgilerinizi görüntülemek için giriş yapın.</Text></View>
        ) : !permitted ? (
          <View style={styles.card}><Text style={styles.title}>Erişim yetkisi bulunmuyor</Text><Text style={styles.body}>Personel öz hizmet bilgilerini görüntüleme yetkiniz bulunmuyor.</Text></View>
        ) : (
          <>
            <Pressable accessibilityRole="button" accessibilityLabel="Personel bilgilerimi yenile" disabled={loading} onPress={() => void load()} style={styles.button}>
              <Text style={styles.buttonText}>Bilgilerimi yenile</Text>
            </Pressable>
            {loading && <ActivityIndicator color="#086ad8" accessibilityLabel="Personel bilgileri yükleniyor" />}
            {!!message && <Text accessibilityRole="alert" style={styles.error}>{message}</Text>}
            {profile && (
              <View style={styles.card}>
                <Text style={styles.title}>{profile.firstName} {profile.lastName}</Text>
                <Text style={styles.label}>Personel durumu</Text>
                <Text style={styles.value}>{profile.status === 'ACTIVE' ? 'Aktif' : profile.status === 'INACTIVE' ? 'Pasif' : 'Durum bilgisi mevcut'}</Text>
                <Text style={styles.label}>Atanmış şube</Text>
                <Text style={styles.value}>{profile.branch?.name ?? 'Şube bilgisi bulunamadı'}</Text>
                <Text style={styles.note}>Bu ekran salt okunurdur. Bilgi değişikliği için yetkili yöneticinizle görüşün.</Text>
              </View>
            )}
            {team && (
              <View style={styles.card}>
                <Text style={styles.title}>Ekibim</Text>
                <Text style={styles.body}>Doğrudan size bağlı personel: {team.length}</Text>
                {team.length === 0 && <Text style={styles.body}>Size bağlı aktif bir personel ataması bulunamadı.</Text>}
                {team.map((member) => (
                  <View key={member.id} style={styles.teamRow}>
                    <Text style={styles.value}>{member.firstName} {member.lastName}</Text>
                    <Text style={styles.body}>Şube: {member.branch?.name ?? 'Bilgi bulunamadı'}</Text>
                    <Text style={styles.label}>Durum: {member.status === 'ACTIVE' ? 'Aktif' : member.status === 'INACTIVE' ? 'Pasif' : 'Diğer'}</Text>
                  </View>
                ))}
              </View>
            )}
            {!!teamMessage && <Text accessibilityRole="alert" style={styles.error}>{teamMessage}</Text>}
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
  heading: { fontSize: 27, fontWeight: '800', color: '#162d4e' },
  intro: { fontSize: 14, lineHeight: 21, color: '#5b6f89' },
  card: { padding: 20, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e1e9f5', borderRadius: 18, gap: 10 },
  teamRow: { borderTopWidth: 1, borderTopColor: '#e1e9f5', paddingTop: 12, gap: 4 },
  title: { color: '#1c3553', fontWeight: '700', fontSize: 18 },
  body: { color: '#64748b', fontSize: 14, lineHeight: 21 },
  label: { color: '#617995', fontSize: 12, fontWeight: '600', marginTop: 8 },
  value: { color: '#193b61', fontSize: 16, fontWeight: '700' },
  note: { color: '#6b7f99', fontSize: 12, lineHeight: 19, marginTop: 12 },
  button: { backgroundColor: '#e3efff', borderRadius: 12, paddingVertical: 13, paddingHorizontal: 16, alignItems: 'center' },
  buttonText: { color: '#086ad8', fontWeight: '700', fontSize: 14 },
  error: { color: '#a52424', padding: 12, backgroundColor: '#fef0ef', borderRadius: 10, fontSize: 13 },
});
