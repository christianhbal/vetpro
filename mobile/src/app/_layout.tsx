import { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export default function RootLayout() {
  const router = useRouter();

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(() => {
      router.push('/notificaciones');
    });
    return () => subscription.remove();
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
      <Stack.Screen name="metodos-pago" />
      <Stack.Screen name="historial" />
      <Stack.Screen name="escanear-qr" />
      <Stack.Screen name="nueva-mascota" />
      <Stack.Screen name="nuevo-turno" />
      <Stack.Screen name="admin-usuarios" />
      <Stack.Screen name="admin-turnos" />
      <Stack.Screen name="notificaciones" />
    </Stack>
  );
}