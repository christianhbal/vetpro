import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      <Stack screenOptions={{ headerShown: false, animation: 'none' }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="app" />
        <Stack.Screen name="mascotas" />
        <Stack.Screen name="turnos" />
        <Stack.Screen name="perfil" />
        <Stack.Screen name="registro" />
        <Stack.Screen name="nueva-mascota" />
        <Stack.Screen name="nuevo-turno" />
        <Stack.Screen name="explore" />
      </Stack>
    </ThemeProvider>
  );
}
