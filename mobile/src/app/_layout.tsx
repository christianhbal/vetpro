import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { sincronizarRecordatorios } from '@/lib/recordatorios';
import { Stack, useRouter } from 'expo-router';

export default function RootLayout() {
  const router = useRouter();

  useEffect(() => {
    let subscription: { remove: () => void } | undefined;
    void sincronizarRecordatorios();
    const estado = AppState.addEventListener('change', (siguiente) => {
      if (siguiente === 'active') void sincronizarRecordatorios();
    });

    let activo = true;
    if (Platform.OS !== 'web') {
      void (async () => {
        try {
          const Notifications = await import('expo-notifications');
          if (!activo) return;
          Notifications.setNotificationHandler({
            handleNotification: async () => ({
              shouldShowBanner: true,
              shouldShowList: true,
              shouldPlaySound: true,
              shouldSetBadge: false,
            }),
          });
          subscription = Notifications.addNotificationResponseReceivedListener(() => {
            router.push('/notificaciones');
          });
        } catch (error) {
          console.warn('Las notificaciones no están disponibles en este entorno:', error);
        }
      })();
    }

    return () => { activo = false; subscription?.remove(); estado.remove(); };
  }, [router]);

  return (
    <Stack screenOptions={{ headerShown: false, animation: 'none' }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="registro" />
      <Stack.Screen name="app" />
      <Stack.Screen name="mascotas" />
      <Stack.Screen name="turnos" />
      <Stack.Screen name="perfil" />
<Stack.Screen name="editar-perfil" />
      <Stack.Screen name="escanear-qr" />
      <Stack.Screen name="nueva-mascota" />
        <Stack.Screen name="editar-mascota" />
      <Stack.Screen name="nuevo-turno" />
      <Stack.Screen name="marcar-turno" />
      <Stack.Screen name="admin-usuarios" />
<Stack.Screen name="admin-turnos-activos" />
        <Stack.Screen name="admin-sedes" />
      <Stack.Screen name="notificaciones" />
    </Stack>
  );
}