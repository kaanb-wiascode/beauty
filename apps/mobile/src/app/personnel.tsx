import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
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
type PendingLeave = { id: string; firstName: string; lastName: string; startDate: string; endDate: string; days: string; leaveType: string | null };
type PendingLeaves = { data: PendingLeave[] };
type ActionableLeave = PendingLeave & { approvalId: string };
type ActionableLeaves = { data: ActionableLeave[] };
type AttendanceEvent = { id: string; eventType: string; occurredAt: string; approvalStatus: string | null };
type MobileAttendance = { data: AttendanceEvent[] };
type LeaveRequest = { id: string; leaveType: string | null; startDate: string; endDate: string; days: string; status: string };
type MobileLeaveHistory = { data: LeaveRequest[] };
type LeaveBalance = { leaveTypeId: string; name: string; available: number };
type MobileLeaveBalances = { data: LeaveBalance[] };

export default function PersonnelScreen() {
  const { session, expireSession } = useValooSession();
  const token = session?.accessToken ?? null;
  const permitted = session?.membership.permissions.includes('hr_self_service.read') ?? false;
  const canReadTeam = session?.membership.permissions.includes('staff.read') ?? false;
  const [profile, setProfile] = useState<MobileProfile | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const [team, setTeam] = useState<TeamMember[] | null>(null);
  const [pendingLeaves, setPendingLeaves] = useState<PendingLeave[] | null>(null);
  const [actionableLeaves, setActionableLeaves] = useState<ActionableLeave[]>([]);
  const [decisionBusy, setDecisionBusy] = useState(false);
  const decisionBusyRef = useRef(false);
  const [rejectionId, setRejectionId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [decisionMessage, setDecisionMessage] = useState<string | null>(null);
  const [teamMessage, setTeamMessage] = useState<string | null>(null);
  const [attendance, setAttendance] = useState<AttendanceEvent[] | null>(null);
  const [attendanceMessage, setAttendanceMessage] = useState<string | null>(null);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[] | null>(null);
  const [leaveMessage, setLeaveMessage] = useState<string | null>(null);
  const [balances, setBalances] = useState<LeaveBalance[] | null>(null);
  const [leaveTypeId, setLeaveTypeId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [requestedDays, setRequestedDays] = useState('');
  const [leaveSubmitting, setLeaveSubmitting] = useState(false);
  const leaveSubmittingRef = useRef(false);
  const [leaveActionMessage, setLeaveActionMessage] = useState<string | null>(null);
  const [attendanceSubmitting, setAttendanceSubmitting] = useState(false);
  const attendanceSubmittingRef = useRef(false);
  const [attendanceActionMessage, setAttendanceActionMessage] = useState<string | null>(null);
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
    setPendingLeaves(null);
    setActionableLeaves([]);
    setTeamMessage(null);
    setAttendance(null);
    setAttendanceMessage(null);
    setLeaveRequests(null);
    setLeaveMessage(null);
    setBalances(null);
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
        const attendanceResult = await valooRequest<MobileAttendance>('/hr/self-service/me/mobile-attendance', {
          accessToken: token,
          signal,
        });
        if (!signal.aborted) {
          if (!Array.isArray(attendanceResult.data)) throw new Error('Puantaj yanıtı geçersiz.');
          setAttendance(attendanceResult.data);
        }
      } catch (attendanceError) {
        if (signal.aborted) return;
        if (attendanceError instanceof ValooApiError && attendanceError.status === 401) {
          expireSession();
          return;
        }
        setAttendanceMessage(attendanceError instanceof Error ? attendanceError.message : 'Günlük giriş çıkış kayıtları yüklenemedi.');
      }
      try {
        const leaveResult = await valooRequest<MobileLeaveHistory>('/hr/self-service/me/mobile-leave-history', {
          accessToken: token,
          signal,
        });
        if (!signal.aborted) {
          if (!Array.isArray(leaveResult.data)) throw new Error('İzin geçmişi yanıtı geçersiz.');
          setLeaveRequests(leaveResult.data);
        }
      } catch (leaveError) {
        if (signal.aborted) return;
        if (leaveError instanceof ValooApiError && leaveError.status === 401) {
          expireSession();
          return;
        }
        setLeaveMessage(leaveError instanceof Error ? leaveError.message : 'İzin geçmişi yüklenemedi.');
      }
      try {
        const balanceResult = await valooRequest<MobileLeaveBalances>('/hr/self-service/me/mobile-leave-balances', {
          accessToken: token,
          signal,
        });
        if (!signal.aborted) {
          if (!Array.isArray(balanceResult.data)) throw new Error('İzin bakiyesi yanıtı geçersiz.');
          setBalances(balanceResult.data);
        }
      } catch (balanceError) {
        if (signal.aborted) return;
        if (balanceError instanceof ValooApiError && balanceError.status === 401) {
          expireSession();
          return;
        }
        setLeaveMessage(balanceError instanceof Error ? balanceError.message : 'İzin bakiyesi yüklenemedi.');
      }
      if (canReadTeam) try {
        const teamResult = await valooRequest<MobileTeam>('/hr/self-service/manager/mobile-team', {
          accessToken: token,
          signal,
        });
        if (!signal.aborted) {
          if (!Array.isArray(teamResult.data)) throw new Error('Ekip bilgileri beklenen biçimde değil.');
          setTeam(teamResult.data);
          const pendingResult = await valooRequest<PendingLeaves>('/hr/self-service/manager/mobile-pending-leaves', { accessToken: token, signal });
          if (!signal.aborted && Array.isArray(pendingResult.data)) setPendingLeaves(pendingResult.data);
          const actionableResult = await valooRequest<ActionableLeaves>('/hr/self-service/manager/mobile-actionable-leaves', { accessToken: token, signal });
          if (!signal.aborted && Array.isArray(actionableResult.data)) setActionableLeaves(actionableResult.data);
        }
      } catch (teamError) {
        if (signal.aborted) return;
        if (teamError instanceof ValooApiError && teamError.status === 401) {
          expireSession();
          return;
        }
        if (teamError instanceof ValooApiError && teamError.status === 403) {
          // A self-service user may be allowed to view their own profile
          // without being authorized to view the manager team.
          setTeam(null);
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
  }, [token, permitted, canReadTeam, expireSession]);

  const submitAttendance = useCallback((action: 'clock-in' | 'break-start' | 'break-end' | 'clock-out', label: string) => {
    if (!token || !permitted || loading || attendanceSubmittingRef.current) return;
    Alert.alert('Puantaj işlemini onayla', `${label} kaydı sunucu saatiyle oluşturulacak ve yönetici onayına gönderilecek. Devam edilsin mi?`, [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Onayla', onPress: () => {
        if (attendanceSubmittingRef.current) return;
        attendanceSubmittingRef.current = true;
        setAttendanceSubmitting(true);
        setAttendanceActionMessage(null);
        void (async () => {
          try {
            const result = await valooRequest<{ approvalStatus: string }>(`/hr/self-service/me/attendance/${action}`, {
              method: 'POST',
              accessToken: token,
            });
            setAttendanceActionMessage(result.approvalStatus === 'PENDING' ? 'İşlem kaydedildi; yönetici onayı bekleniyor.' : 'İşlem kaydedildi.');
            await load();
            setAttendanceActionMessage(result.approvalStatus === 'PENDING' ? 'İşlem kaydedildi; yönetici onayı bekleniyor.' : 'İşlem kaydedildi.');
          } catch (error) {
            if (error instanceof ValooApiError && error.status === 401) expireSession();
            else setAttendanceActionMessage(error instanceof Error ? error.message : 'Puantaj işlemi tamamlanamadı.');
          } finally {
            attendanceSubmittingRef.current = false;
            setAttendanceSubmitting(false);
          }
        })();
      } },
    ]);
  }, [token, permitted, loading, load, expireSession]);

  const submitLeave = useCallback(() => {
    if (!token || !permitted || leaveSubmittingRef.current || !leaveTypeId) return;
    if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(startDate) || !/^\\d{4}-\\d{2}-\\d{2}$/.test(endDate)
      || !Number.isFinite(Number(requestedDays)) || Number(requestedDays) <= 0 || startDate > endDate) {
      setLeaveActionMessage('Geçerli tarihleri (YYYY-AA-GG) ve pozitif izin gün sayısını girin.');
      return;
    }
    Alert.alert('İzin talebini onayla', 'Başvurunuz yönetici onayına gönderilecek. Devam edilsin mi?', [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Başvur', onPress: () => {
        if (leaveSubmittingRef.current) return;
        leaveSubmittingRef.current = true;
        setLeaveSubmitting(true);
        setLeaveActionMessage(null);
        void (async () => {
          try {
            await valooRequest('/hr/self-service/me/leave-requests', {
              accessToken: token,
              method: 'POST',
              body: { leaveTypeId, startDate, endDate, days: Number(requestedDays) },
            });
            await load();
            setLeaveActionMessage('İzin başvurunuz alındı; onay süreci bekleniyor.');
            setStartDate('');
            setEndDate('');
            setRequestedDays('');
          } catch (error) {
            if (error instanceof ValooApiError && error.status === 401) expireSession();
            else setLeaveActionMessage(error instanceof Error ? error.message : 'İzin başvurusu oluşturulamadı.');
          } finally {
            leaveSubmittingRef.current = false;
            setLeaveSubmitting(false);
          }
        })();
      } },
    ]);
  }, [token, permitted, leaveTypeId, startDate, endDate, requestedDays, load, expireSession]);

  const decideLeave = useCallback((approvalId: string, action: 'APPROVE' | 'REJECT', comment?: string) => {
    if (!token || decisionBusyRef.current || (action === 'REJECT' && !comment?.trim())) {
      if (action === 'REJECT') setDecisionMessage('Ret gerekçesi zorunludur.');
      return;
    }
    Alert.alert('İzin kararını onayla', action === 'APPROVE' ? 'İzin talebini onaylamak istiyor musunuz?' : 'İzin talebini reddetmek istiyor musunuz?', [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Devam et', onPress: () => {
        if (decisionBusyRef.current) return;
        decisionBusyRef.current = true;
        setDecisionBusy(true);
        setDecisionMessage(null);
        void (async () => {
          try {
            await valooRequest(`/hr/self-service/manager/mobile-leave-decisions/${encodeURIComponent(approvalId)}`, {
              method: 'POST', accessToken: token, body: { action, comment: comment?.trim() },
            });
            await load();
            setRejectionId(null);
            setRejectionReason('');
            setDecisionMessage('İzin kararı işlendi. Bekleyen talepler yenilendi.');
          } catch (error) {
            if (error instanceof ValooApiError && error.status === 401) expireSession();
            else setDecisionMessage(error instanceof Error ? error.message : 'İzin kararı işlenemedi.');
          } finally {
            decisionBusyRef.current = false;
            setDecisionBusy(false);
          }
        })();
      } },
    ]);
  }, [token, load, expireSession]);

  useEffect(() => {
    if (token && permitted) void load();
    else {
      setProfile(null);
      setTeam(null);
      setPendingLeaves(null);
      setTeamMessage(null);
      setAttendance(null);
      setAttendanceMessage(null);
      setLeaveRequests(null);
      setLeaveMessage(null);
      setBalances(null);
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
            {attendance && (
              <View style={styles.card}>
                <Text style={styles.title}>Bugünkü giriş ve çıkışlarım</Text>
                {attendance.length === 0 && <Text style={styles.body}>Bugün kayıt bulunamadı.</Text>}
                {attendance.map((event) => (
                  <View key={event.id} style={styles.teamRow}>
                    <Text style={styles.value}>{event.eventType === 'DAY_START' ? 'İşe giriş' : event.eventType === 'DAY_END' ? 'İşten çıkış' : event.eventType === 'BREAK_START' ? 'Mola başlangıcı' : event.eventType === 'BREAK_END' ? 'Mola bitişi' : 'Puantaj olayı'}</Text>
                    <Text style={styles.body}>{new Date(event.occurredAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</Text>
                    <Text style={styles.label}>Onay: {event.approvalStatus === 'PENDING' ? 'Yönetici onayı bekliyor' : event.approvalStatus === 'APPROVED' ? 'Onaylandı' : event.approvalStatus === 'REJECTED' ? 'Reddedildi' : event.approvalStatus ? event.approvalStatus : 'Onay kaydı bulunamadı'}</Text>
                  </View>
                ))}
                <Text style={styles.note}>Yeni işlemler sunucu saatiyle kaydedilir ve onay sürecine girer.</Text>
                <View style={styles.actionRow}>
                  {([
                    ['clock-in', 'İşe giriş'],
                    ['break-start', 'Molaya çık'],
                    ['break-end', 'Moladan dön'],
                    ['clock-out', 'İşten çıkış'],
                  ] as const).map(([action, label]) => (
                    <Pressable key={action} accessibilityRole="button" disabled={loading || attendanceSubmitting} onPress={() => submitAttendance(action, label)} style={styles.button}>
                      <Text style={styles.buttonText}>{label}</Text>
                    </Pressable>
                  ))}
                </View>
                {attendanceSubmitting && <ActivityIndicator accessibilityLabel="Puantaj işlemi gönderiliyor" />}
                {!!attendanceActionMessage && <Text accessibilityRole="alert" style={styles.body}>{attendanceActionMessage}</Text>}
              </View>
            )}
            {!!attendanceMessage && <Text accessibilityRole="alert" style={styles.error}>{attendanceMessage}</Text>}
            {balances && (
              <View style={styles.card}>
                <Text style={styles.title}>İzin bakiyem ve yeni talep</Text>
                {balances.length === 0 && <Text style={styles.body}>Başvuruya uygun izin hakkı bulunamadı.</Text>}
                {balances.map((balance) => (
                  <Pressable key={balance.leaveTypeId} accessibilityRole="radio" accessibilityState={{ checked: leaveTypeId === balance.leaveTypeId }} onPress={() => setLeaveTypeId(balance.leaveTypeId)} style={styles.button}>
                    <Text style={styles.buttonText}>{leaveTypeId === balance.leaveTypeId ? '● ' : '○ '}{balance.name} · {balance.available} gün</Text>
                  </Pressable>
                ))}
                {balances.length > 0 && (
                  <>
                    <Text style={styles.label}>Başlangıç tarihi (YYYY-AA-GG)</Text>
                    <TextInput accessibilityLabel="İzin başlangıç tarihi" placeholder="2026-11-01" value={startDate} onChangeText={setStartDate} style={styles.input} autoCapitalize="none" />
                    <Text style={styles.label}>Bitiş tarihi (YYYY-AA-GG)</Text>
                    <TextInput accessibilityLabel="İzin bitiş tarihi" placeholder="2026-11-03" value={endDate} onChangeText={setEndDate} style={styles.input} autoCapitalize="none" />
                    <Text style={styles.label}>Talep edilen gün sayısı</Text>
                    <TextInput accessibilityLabel="Talep edilen gün sayısı" keyboardType="decimal-pad" placeholder="3" value={requestedDays} onChangeText={setRequestedDays} style={styles.input} />
                    <Pressable accessibilityRole="button" disabled={leaveSubmitting || loading || !leaveTypeId} onPress={submitLeave} style={styles.button}>
                      <Text style={styles.buttonText}>{leaveSubmitting ? 'Başvuru gönderiliyor…' : 'İzin talebini gönder'}</Text>
                    </Pressable>
                  </>
                )}
                {!!leaveActionMessage && <Text accessibilityRole="alert" style={styles.body}>{leaveActionMessage}</Text>}
              </View>
            )}
            {leaveRequests && (
              <View style={styles.card}>
                <Text style={styles.title}>İzin geçmişim</Text>
                {leaveRequests.length === 0 && <Text style={styles.body}>İzin başvurusu bulunamadı.</Text>}
                {leaveRequests.map((leave) => (
                  <View key={leave.id} style={styles.teamRow}>
                    <Text style={styles.value}>{leave.leaveType ?? 'İzin'}</Text>
                    <Text style={styles.body}>{leave.startDate} – {leave.endDate} · {leave.days} gün</Text>
                    <Text style={styles.label}>Durum: {leave.status === 'PENDING' ? 'Onay bekliyor' : leave.status === 'APPROVED' ? 'Onaylandı' : leave.status === 'REJECTED' ? 'Reddedildi' : leave.status}</Text>
                  </View>
                ))}
                <Text style={styles.note}>Son 20 izin başvurusu görüntülenir.</Text>
              </View>
            )}
            {!!leaveMessage && <Text accessibilityRole="alert" style={styles.error}>{leaveMessage}</Text>}
            {!!decisionMessage && <Text accessibilityRole="alert" style={styles.body}>{decisionMessage}</Text>}
            {pendingLeaves && (
              <View style={styles.card}>
                <Text style={styles.title}>Ekibimin bekleyen izinleri</Text>
                {pendingLeaves.length === 0 && <Text style={styles.body}>Bekleyen izin talebi yok.</Text>}
                {pendingLeaves.map((leave) => (
                  <View key={leave.id} style={styles.teamRow}>
                    <Text style={styles.value}>{leave.firstName} {leave.lastName}</Text>
                    <Text style={styles.body}>{leave.leaveType ?? 'İzin'} · {leave.startDate} – {leave.endDate} · {leave.days} gün</Text>
                    <Text style={styles.label}>Onay bekliyor</Text>
                    {actionableLeaves.find((item) => item.id === leave.id) && (
                      <View style={styles.actionRow}>
                        <Pressable accessibilityRole="button" disabled={decisionBusy || loading} style={styles.button} onPress={() => decideLeave(actionableLeaves.find((item) => item.id === leave.id)!.approvalId, 'APPROVE')}>
                          <Text style={styles.buttonText}>Onayla</Text>
                        </Pressable>
                        <Pressable accessibilityRole="button" disabled={decisionBusy || loading} style={styles.button} onPress={() => { setRejectionId(leave.id); setRejectionReason(''); }}>
                          <Text style={styles.buttonText}>Reddet</Text>
                        </Pressable>
                        {rejectionId === leave.id && (
                          <>
                            <TextInput accessibilityLabel="İzin ret gerekçesi" multiline placeholder="Ret gerekçesini yazın" value={rejectionReason} onChangeText={setRejectionReason} style={styles.input} />
                            <Pressable accessibilityRole="button" disabled={decisionBusy || !rejectionReason.trim()} style={styles.button} onPress={() => decideLeave(actionableLeaves.find((item) => item.id === leave.id)!.approvalId, 'REJECT', rejectionReason)}>
                              <Text style={styles.buttonText}>Gerekçeyle reddet</Text>
                            </Pressable>
                          </>
                        )}
                      </View>
                    )}
                  </View>
                ))}
              </View>
            )}
            {team && (
              <View style={styles.card}>
                <Text style={styles.title}>Ekibim</Text>
                <Text style={styles.body}>Doğrudan size bağlı personel: {team.length}</Text>
                {team.length === 0 && <Text style={styles.body}>Size bağlı personel ataması bulunamadı.</Text>}
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
  actionRow: { gap: 8 },
  input: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, padding: 12, color: '#193b61', fontSize: 15 },
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
