import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { API_BASE_URL } from '@/lib/api';
import type { UsuarioActual } from '@/lib/session';

export async function registrarNotificacionesPush(usuario: UsuarioActual): Promise<string | null> {
  if (Platform.OS === 'web' || !Device.isDevice) return null;

  const projectId =
    Constants.easConfig?.projectId ??
    Constants.expoConfig?.extra?.eas?.projectId;
  if (typeof projectId !== 'string' || !projectId) {
    return 'Falta configurar el ID del proyecto EAS para activar las notificaciones push.';
  }

  let Notifications;
  try {
    Notifications = require('expo-notifications');
  } catch {
    return 'Las notificaciones push no están disponibles en este entorno (requiere una build propia).';
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Avisos de VetPro',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#0f3e17',
    });
  }

  let permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) {
    permission = await Notifications.requestPermissionsAsync();
  }
  if (!permission.granted) {
    return 'No se concedió permiso para mostrar notificaciones push en este dispositivo.';
  }

  const pushToken = await Notifications.getExpoPushTokenAsync({ projectId });
  const response = await fetch(`${API_BASE_URL}/api/push-tokens`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${usuario.accessToken}`,
    },
    body: JSON.stringify({ token: pushToken.data }),
  });
  if (!response.ok) {
    const result: unknown = await response.json().catch(() => null);
    const message =
      typeof result === 'object' &&
      result !== null &&
      'message' in result &&
      typeof result.message === 'string'
        ? result.message
        : `No se pudo registrar el dispositivo (HTTP ${response.status}).`;
    throw new Error(message);
  }

  return null;
}
