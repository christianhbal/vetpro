import { API_BASE_URL } from './api';
import type { UsuarioActual } from './session';

export async function consultarNotificaciones(usuario: UsuarioActual) {
  const headers = { Authorization: `Bearer ${usuario.accessToken}` };
  if (!usuario.esAdmin) {
    const generacion = await fetch(`${API_BASE_URL}/api/notifications/reminders`, {
      method: 'POST',
      headers,
    });
    if (!generacion.ok) throw new Error('No se pudieron generar los recordatorios.');
  }
  return fetch(`${API_BASE_URL}/api/notifications`, { headers });
}
