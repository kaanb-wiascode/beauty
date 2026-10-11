import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { useColorScheme } from 'react-native';

import AppTabs from '@/components/app-tabs';
import { ValooSessionProvider } from '@/lib/valoo-session';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <ValooSessionProvider>
        <AppTabs />
      </ValooSessionProvider>
    </ThemeProvider>
  );
}
