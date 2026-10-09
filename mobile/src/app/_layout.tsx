import { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';

export default function RootLayout() {
  const router = useRouter();

  useEffect(() => {
    let subscription: { remove: () => void } | undefined;

    try {
      const Notifications = require('expo-notifications');

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

    return () => subscription?.remove();
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
      <Stack.Screen name="historial" />
      <Stack.Screen name="escanear-qr" />
      <Stack.Screen name="nueva-mascota" />
      <Stack.Screen name="nuevo-turno" />
      <Stack.Screen name="admin-usuarios" />
      <Stack.Screen name="admin-turnos" />
      <Stack.Screen name="admin-turnos-activos" />
      <Stack.Screen name="notificaciones" />
    </Stack>
  );
}