import { Platform } from 'react-native';

/**
 * `EXPO_PUBLIC_*` variables are inlined by babel-preset-expo when Metro builds
 * the bundle. That happens once, at dev-server startup, from the `.env` file as
 * it exists *at that moment*. If you create or edit `.env` later you MUST
 * restart `npx expo start` -- hot reload and re-scanning the QR will not pick
 * the new value up, and `process.env.EXPO_PUBLIC_API_URL` stays `undefined`.
 */
const configuredApiUrl = process.env.EXPO_PUBLIC_API_URL?.trim();

/** Simulators and the web target share the machine running Metro. */
const hostFallback = Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';

export const API_BASE_URL = (configuredApiUrl || hostFallback).replace(/\/+$/, '');

/**
 * On a physical device a loopback host points at the phone itself, so the
 * request can never reach the dev machine. This is the single most common
 * cause of "no hay conexion con la API" and it is otherwise invisible.
 */
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
