import { Stack } from 'expo-router';

export default function RootLayout() {
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
    </Stack>
  );
}