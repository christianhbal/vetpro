import { Platform } from 'react-native';

const configuredApiUrl = process.env.EXPO_PUBLIC_API_URL?.trim();

const hostFallback = Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';

export const API_BASE_URL = (configuredApiUrl || hostFallback).replace(/\/+$/, '');

// En un celular físico, localhost apunta al propio dispositivo.
export const pointsAtThisDevice =
  /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|10\.0\.2\.2)(:\d+)?(\/|$)/i.test(API_BASE_URL);

export function apiUnreachableMessage(error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error ?? 'sin detalle');

  if (pointsAtThisDevice) {
    return (
      `La app apunta a ${API_BASE_URL}, que en un celular fisico es el mismo telefono, no tu PC.\n\n` +
      `Revisa mobile/.env (EXPO_PUBLIC_API_URL) y reinicia Expo con "npx expo start --clear".\n\n` +
      `Detalle: ${detail}`
    );
  }

  return (
    `No se pudo alcanzar ${API_BASE_URL}.\n\n` +
    `Comprueba que el backend este encendido, que el celular use la misma red que la PC ` +
    `y que el firewall permita el puerto 3000.\n\n` +
    `Detalle: ${detail}`
  );
}
