import { useEffect } from 'react';
import { AppState, Platform, StyleSheet } from 'react-native';
import { useRecordatorios } from '@/lib/recordatorios';
import { SesionProvider } from '@/lib/sesion-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Stack, useRouter } from 'expo-router';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.raiz}>
      <SesionProvider>
        <Navegacion />
      </SesionProvider>
    </GestureHandlerRootView>
  );
}

function Navegacion() {
  const router = useRouter();
  const sincronizarRecordatorios = useRecordatorios();

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
  }, [router, sincronizarRecordatorios]);

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

const styles = StyleSheet.create({ raiz: { flex: 1 } });
