import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';
import { useValooSession } from '@/lib/valoo-session';

export default function AppTabs() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];
  const { session, me } = useValooSession();
  const permissions = session?.membership.permissions ?? [];
  const canViewPersonnel = permissions.includes('hr_self_service.read');
  const canViewOperations = permissions.includes('operations.read') && Boolean(me?.tenantContext.branchId);
  const canViewAppointments = permissions.includes('appointments.read');

  return (
    <NativeTabs
      backgroundColor={colors.background}
      indicatorColor={colors.backgroundElement}
      labelStyle={{ selected: { color: colors.text } }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>VALOO</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/home.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>

      {canViewPersonnel && (
      <NativeTabs.Trigger name="personnel">
        <NativeTabs.Trigger.Label>Personel</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/home.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>
      )}

      {canViewOperations && (
      <NativeTabs.Trigger name="operations">
        <NativeTabs.Trigger.Label>Operasyon</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/explore.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>
      )}

      {canViewAppointments && (
      <NativeTabs.Trigger name="explore">
        <NativeTabs.Trigger.Label>Randevular</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/explore.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>
      )}
    </NativeTabs>
  );
}
