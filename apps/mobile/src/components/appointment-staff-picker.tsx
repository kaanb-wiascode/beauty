import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  ValooApiError,
  valooRequest,
  type AppointmentStaffOption,
  type AppointmentStaffOptionsResponse,
} from '@/lib/valoo-api';

type Props = {
  accessToken: string;
  selected: AppointmentStaffOption | null;
  onSelect: (option: AppointmentStaffOption | null) => void;
  onUnauthorized: () => void;
};

export function AppointmentStaffPicker({
  accessToken,
  selected,
  onSelect,
  onUnauthorized,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [choices, setChoices] = useState<AppointmentStaffOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeRequest = useRef<AbortController | null>(null);

  const load = useCallback(async (term: string) => {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setError(null);
    setLoading(true);
    setChoices([]);

    try {
      const params = term.trim()
        ? `?search=${encodeURIComponent(term.trim().slice(0, 80))}`
        : '';
      const result = await valooRequest<AppointmentStaffOptionsResponse>(
        `/appointments/staff-options${params}`,
        { accessToken, signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      if (!Array.isArray(result.data) || result.data.some(
        (item) => !item || typeof item.id !== 'string' ||
          typeof item.firstName !== 'string' || typeof item.lastName !== 'string',
      )) {
        throw new Error('Personel listesi beklenen biçimde değil.');
      }
      setChoices(result.data);
    } catch (cause) {
      if (controller.signal.aborted) return;
      if (cause instanceof ValooApiError && cause.status === 401) {
        onUnauthorized();
      } else {
        setError(cause instanceof Error ? cause.message : 'Personel listesi yüklenemedi.');
      }
    } finally {
      if (activeRequest.current === controller) {
        activeRequest.current = null;
        setLoading(false);
      }
    }
  }, [accessToken, onUnauthorized]);

  useEffect(() => {
    if (!open) {
      activeRequest.current?.abort();
      setLoading(false);
      return;
    }
    void load('');
    return () => activeRequest.current?.abort();
  }, [open, load]);

  const currentLabel = selected
    ? `${selected.firstName} ${selected.lastName}`
    : 'Tüm personel';

  return (
    <View style={styles.wrapper}>
      <View style={styles.heading}>
        <Text style={styles.headingText}>Personel</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          onPress={() => setOpen((value) => !value)}
          style={styles.toggle}>
          <Text style={styles.toggleText}>{open ? 'Seçimi kapat' : 'Personel seç'}</Text>
        </Pressable>
      </View>
      <Text style={styles.selection}>{currentLabel}</Text>
      {selected && (
        <Pressable
          accessibilityRole="button"
          onPress={() => onSelect(null)}
          style={styles.clearButton}>
          <Text style={styles.clearText}>Personel filtresini temizle</Text>
        </Pressable>
      )}
      {open && (
        <View style={styles.panel}>
          <Text style={styles.help}>
            Yalnızca erişiminizdeki şubelere ait aktif personeller listelenir. İlk 30 sonuç gösterilir.
          </Text>
          <View style={styles.searchRow}>
            <TextInput
              style={styles.input}
              accessibilityLabel="Personel adına göre ara"
              placeholder="Ad veya soyad yazın"
              placeholderTextColor="#788ba4"
              autoCapitalize="words"
              value={search}
              onChangeText={setSearch}
              maxLength={80}
              onSubmitEditing={() => void load(search)}
            />
            <Pressable
              accessibilityRole="button"
              disabled={loading}
              onPress={() => void load(search)}
              style={[styles.searchButton, loading && styles.disabled]}>
              <Text style={styles.searchText}>Ara</Text>
            </Pressable>
          </View>
          {loading && <ActivityIndicator color="#086ad8" />}
          {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
          {!loading && !error && choices.length === 0 && (
            <Text style={styles.help}>Eşleşen aktif personel bulunamadı.</Text>
          )}
          <ScrollView style={styles.results} nestedScrollEnabled>
            {choices.map((item) => (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                onPress={() => {
                  onSelect(item);
                  setOpen(false);
                }}
                style={styles.option}>
                <Text style={styles.optionText}>{item.firstName} {item.lastName}</Text>
                <Text style={styles.optionHint}>
                  {item.id === selected?.id ? 'Seçili' : 'Seç'}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: 8, marginTop: 5 },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  headingText: { color: '#3d5778', fontSize: 12, fontWeight: '700' },
  toggle: { backgroundColor: '#e6effc', borderRadius: 9, paddingVertical: 9, paddingHorizontal: 13 },
  toggleText: { color: '#086ad8', fontSize: 12, fontWeight: '700' },
  selection: { color: '#223d60', fontWeight: '600', fontSize: 13 },
  clearButton: { alignSelf: 'flex-start', padding: 6 },
  clearText: { color: '#086ad8', fontSize: 12 },
  panel: { backgroundColor: '#ffffff', borderColor: '#dbe5f3', borderWidth: 1, borderRadius: 14, padding: 13, gap: 10 },
  help: { color: '#637a96', fontSize: 12, lineHeight: 18 },
  searchRow: { flexDirection: 'row', gap: 7 },
  input: { flex: 1, minWidth: 0, borderColor: '#cfdaeb', borderWidth: 1, borderRadius: 9, paddingHorizontal: 10, minHeight: 44, color: '#152d4d' },
  searchButton: { backgroundColor: '#086ad8', borderRadius: 9, justifyContent: 'center', paddingHorizontal: 15 },
  searchText: { color: '#ffffff', fontWeight: '700', fontSize: 12 },
  error: { backgroundColor: '#fff1f0', color: '#b42318', padding: 10, borderRadius: 9, fontSize: 12 },
  results: { maxHeight: 220 },
  option: { paddingVertical: 12, paddingHorizontal: 7, borderBottomColor: '#e8edf5', borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 6 },
  optionText: { color: '#223d60', fontSize: 13, fontWeight: '600', flex: 1 },
  optionHint: { color: '#086ad8', fontSize: 11 },
  disabled: { opacity: 0.5 },
});
