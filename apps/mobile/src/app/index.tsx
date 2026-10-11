import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useValooSession } from '@/lib/valoo-session';

function ActionButton({
  label,
  onPress,
  disabled = false,
  secondary = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        secondary && styles.secondaryButton,
        (pressed || disabled) && styles.buttonMuted,
      ]}>
      <Text style={[styles.buttonText, secondary && styles.secondaryButtonText]}>{label}</Text>
    </Pressable>
  );
}

export default function HomeScreen() {
  const { session, me, challenge, enrollment, busy, error, login, beginEnrollment, verifyCode, signOut, clearError } =
    useValooSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');

  const submitLogin = () => {
    if (!email.trim() || !password) return;
    clearError();
    void login(email, password).then(() => setPassword(''));
  };

  const submitCode = () => {
    if (code.trim().length !== 6) return;
    clearError();
    void verifyCode(code).then(() => setCode(''));
  };

  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.brand}>
            <Text style={styles.brandName}>VALOO</Text>
            <Text style={styles.brandSubtitle}>İşletme Yönetim Platformu</Text>
          </View>

          <View style={styles.card}>
            {session && me ? (
              <>
                <Text style={styles.eyebrow}>GÜVENLİ OTURUM</Text>
                <Text style={styles.heading}>Hoş geldiniz, {session.user.firstName}</Text>
                <Text style={styles.paragraph}>
                  {session.tenant.name} işletmesine ait aktif üyeliğiniz doğrulandı.
                </Text>
                <View style={styles.detail}><Text style={styles.detailLabel}>Ad Soyad</Text>
                  <Text style={styles.detailValue}>{session.user.firstName} {session.user.lastName}</Text></View>
                <View style={styles.detail}><Text style={styles.detailLabel}>E-posta</Text>
                  <Text style={styles.detailValue}>{session.user.email}</Text></View>
                <View style={styles.detail}><Text style={styles.detailLabel}>Rol</Text>
                  <Text style={styles.detailValue}>{session.membership.role}</Text></View>
                <View style={styles.detail}><Text style={styles.detailLabel}>Şube erişimi</Text>
                  <Text style={styles.detailValue}>{me.tenantContext.branchId ? 'Atanmış şube' : 'Merkez kapsamı'}</Text></View>
                <Text style={styles.helper}>
                  Randevular sekmesi yalnızca sunucunun izin verdiği kayıtları gösterir.
                </Text>
                <ActionButton label="Bu cihazdan çıkış yap" secondary onPress={() => void signOut()} />
              </>
            ) : challenge ? (
              <>
                <Text style={styles.eyebrow}>HESAP GÜVENLİĞİ</Text>
                <Text style={styles.heading}>İki aşamalı doğrulama</Text>
                <Text style={styles.paragraph}>
                  {challenge.enrollmentRequired
                    ? 'Doğrulama uygulamanızı hesabınıza bağlayın ve altı haneli kodu girin.'
                    : 'Doğrulama uygulamanızdaki altı haneli kodu girin.'}
                </Text>
                {challenge.enrollmentRequired && !enrollment && (
                  <ActionButton label="Doğrulama kurulumunu başlat" disabled={busy} onPress={() => void beginEnrollment()} />
                )}
                {enrollment && (
                  <View style={styles.setupBox}>
                    <Text style={styles.detailLabel}>Tek kullanımlık kurulum anahtarı</Text>
                    <Text selectable style={styles.setupSecret}>{enrollment.secret}</Text>
                    <Text style={styles.helper}>
                      Bu anahtarı doğrulama uygulamanıza manuel olarak girin. Başkalarıyla paylaşmayın.
                    </Text>
                  </View>
                )}
                {(!challenge.enrollmentRequired || enrollment) && (
                  <>
                    <Text style={styles.fieldLabel}>Doğrulama kodu</Text>
                    <TextInput
                      accessibilityLabel="Altı haneli doğrulama kodu"
                      style={styles.input}
                      placeholder="000000"
                      placeholderTextColor="#76889f"
                      value={code}
                      onChangeText={setCode}
                      keyboardType="number-pad"
                      textContentType="oneTimeCode"
                      autoComplete="one-time-code"
                      maxLength={6}
                      editable={!busy}
                    />
                    <ActionButton label="Doğrula ve giriş yap" disabled={busy || code.trim().length !== 6} onPress={submitCode} />
                  </>
                )}
                <ActionButton label="Giriş ekranına dön" secondary disabled={busy} onPress={() => {
                  // Discarding the challenge is handled by re-entering credentials.
                  setPassword('');
                  setCode('');
                  void login('', '');
                }} />
              </>
            ) : (
              <>
                <Text style={styles.eyebrow}>PERSONEL GİRİŞİ</Text>
                <Text style={styles.heading}>Hesabınıza giriş yapın</Text>
                <Text style={styles.paragraph}>
                  VALOO kullanıcı hesabınızla güvenli biçimde oturum açın.
                </Text>
                <Text style={styles.fieldLabel}>E-posta</Text>
                <TextInput
                  accessibilityLabel="E-posta adresi"
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  textContentType="username"
                  placeholder="ornek@isletme.com"
                  placeholderTextColor="#76889f"
                  value={email}
                  onChangeText={setEmail}
                  editable={!busy}
                  style={styles.input}
                />
                <Text style={styles.fieldLabel}>Şifre</Text>
                <TextInput
                  accessibilityLabel="Şifre"
                  autoComplete="current-password"
                  textContentType="password"
                  secureTextEntry
                  placeholder="Şifreniz"
                  placeholderTextColor="#76889f"
                  value={password}
                  onChangeText={setPassword}
                  editable={!busy}
                  style={styles.input}
                  onSubmitEditing={submitLogin}
                />
                <ActionButton label="Giriş yap" disabled={busy || !email.trim() || !password} onPress={submitLogin} />
              </>
            )}
            {busy && <ActivityIndicator accessibilityLabel="İşlem sürüyor" style={styles.activity} color="#086ad8" />}
            {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
          </View>
          <Text style={styles.footer}>
            Güvenli oturum · Rol ve şube kontrolleri VALOO sunucusunda uygulanır.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  root: { flex: 1, backgroundColor: '#f2f6fc' },
  content: { flexGrow: 1, justifyContent: 'center', padding: 24, paddingBottom: 52, gap: 22 },
  brand: { alignItems: 'center', gap: 5 },
  brandName: { fontSize: 36, fontWeight: '800', color: '#086ad8', letterSpacing: 3 },
  brandSubtitle: { color: '#516884', fontSize: 13 },
  card: { backgroundColor: '#ffffff', padding: 25, borderRadius: 22, gap: 13, maxWidth: 480, width: '100%', alignSelf: 'center', borderWidth: 1, borderColor: '#e2eaf4' },
  eyebrow: { color: '#086ad8', fontSize: 11, fontWeight: '700', letterSpacing: 1.5 },
  heading: { color: '#132844', fontSize: 23, fontWeight: '700', lineHeight: 30 },
  paragraph: { color: '#536987', fontSize: 14, lineHeight: 21, marginBottom: 8 },
  fieldLabel: { color: '#203b60', fontWeight: '600', fontSize: 13 },
  input: { borderWidth: 1, borderColor: '#cfdaeb', borderRadius: 13, height: 52, paddingHorizontal: 14, color: '#132844', fontSize: 15, backgroundColor: '#fcfdff' },
  button: { minHeight: 49, backgroundColor: '#086ad8', borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginTop: 5, paddingHorizontal: 12 },
  buttonText: { color: 'white', fontWeight: '700', fontSize: 15 },
  secondaryButton: { backgroundColor: '#eef4fd', borderWidth: 1, borderColor: '#dce8f9' },
  secondaryButtonText: { color: '#086ad8' },
  buttonMuted: { opacity: 0.55 },
  error: { color: '#b42318', backgroundColor: '#fff1f0', borderRadius: 10, overflow: 'hidden', padding: 12, fontSize: 13 },
  helper: { color: '#64748b', fontSize: 12, lineHeight: 19, paddingTop: 7 },
  detail: { borderBottomWidth: 1, borderColor: '#e7edf6', paddingVertical: 9, gap: 4 },
  detailLabel: { color: '#64748b', fontSize: 12 },
  detailValue: { color: '#1a3556', fontSize: 15, fontWeight: '600' },
  setupBox: { backgroundColor: '#f2f6fc', padding: 14, borderRadius: 13, gap: 8 },
  setupSecret: { color: '#0c488d', fontWeight: '700', fontSize: 16, letterSpacing: 1.5 },
  activity: { marginTop: 7 },
  footer: { color: '#71839c', fontSize: 11, lineHeight: 16, textAlign: 'center', alignSelf: 'center', maxWidth: 330 },
});
