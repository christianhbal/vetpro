import { Platform } from 'react-native';
import { API_BASE_URL } from '@/lib/api';
import { obtenerUsuarioActual } from '@/lib/session';

const PREFIJO = 'vetpro-turno-';
const UNA_HORA = 60 * 60 * 1000;
let cola: Promise<void> = Promise.resolve();

type TurnoRecordatorio = {
  id: number;
  fecha: string;
  hora: string;
  tipo: string;
  sede: string;
  llegadaEn: string | null;
  atendidoEn: string | null;
  esDemo: boolean;
  ocultoEnAgenda: boolean;
  mascota: { nombre: string };
};

function esTurno(value: unknown): value is TurnoRecordatorio {
  if (typeof value !== 'object' || value === null) return false;
  const turno = value as Record<string, unknown>;
  const mascota = turno.mascota;
  return typeof turno.id === 'number' && Number.isInteger(turno.id) &&
    typeof turno.fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(turno.fecha) &&
    typeof turno.hora === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(turno.hora) &&
    typeof turno.tipo === 'string' && typeof turno.sede === 'string' &&
    (turno.llegadaEn === null || typeof turno.llegadaEn === 'string') &&
    (turno.atendidoEn === null || typeof turno.atendidoEn === 'string') &&
    typeof turno.esDemo === 'boolean' && typeof turno.ocultoEnAgenda === 'boolean' &&
    typeof mascota === 'object' && mascota !== null &&
    'nombre' in mascota && typeof mascota.nombre === 'string';
}

function encolar(tarea: () => Promise<void>): Promise<void> {
  cola = cola.catch(() => {}).then(tarea);
  return cola;
}

export function sincronizarRecordatorios(pedirPermiso = false): Promise<void> {
  if (Platform.OS === 'web') return Promise.resolve();
  return encolar(async () => {
    const Notifications = await import('expo-notifications');
    const usuario = await obtenerUsuarioActual();
    if (!usuario) return;
    let permiso = await Notifications.getPermissionsAsync();
    if (!permiso.granted && pedirPermiso && !usuario.esAdmin && permiso.status === 'undetermined') permiso = await Notifications.requestPermissionsAsync();
    if (!permiso.granted) return;
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Avisos de VetPro', importance: Notifications.AndroidImportance.HIGH,
      });
    }

    let turnos: TurnoRecordatorio[] = [];
    if (!usuario.esAdmin) {
      const response = await fetch(`${API_BASE_URL}/api/turnos?userId=${encodeURIComponent(String(usuario.id))}`, {
        headers: { Authorization: `Bearer ${usuario.accessToken}` },
      });
      if (!response.ok) throw new Error('No se pudieron sincronizar los recordatorios.');
      const resultado: unknown = await response.json();
      if (!Array.isArray(resultado) || !resultado.every(esTurno)) throw new Error('La API devolvió turnos inválidos.');
      turnos = resultado;
    }

    const deseados = new Map<string, { fecha: Date; huella: string; turno: TurnoRecordatorio }>();
    for (const turno of turnos) {
      if (turno.atendidoEn || turno.llegadaEn || turno.esDemo || turno.ocultoEnAgenda) continue;
      const inicio = new Date(`${turno.fecha}T${turno.hora}:00`);
      const fecha = new Date(inicio.getTime() - UNA_HORA);
      if (!Number.isFinite(fecha.getTime()) || fecha.getTime() <= Date.now()) continue;
      const id = `${PREFIJO}${usuario.id}-${turno.id}`;
      const huella = JSON.stringify([turno.fecha, turno.hora, turno.tipo, turno.sede, turno.mascota.nombre]);
      deseados.set(id, { fecha, huella, turno });
    }

    const programados = await Notifications.getAllScheduledNotificationsAsync();
    const existentes = new Set<string>();
    for (const item of programados) {
      if (!item.identifier.startsWith(PREFIJO)) continue;
      const deseado = deseados.get(item.identifier);
      if (deseado && item.content.data?.huella === deseado.huella) {
        existentes.add(item.identifier);
      } else {
        await Notifications.cancelScheduledNotificationAsync(item.identifier);
      }
    }
    for (const [id, item] of deseados) {
      if (existentes.has(id)) continue;
      await Notifications.scheduleNotificationAsync({
        identifier: id,
        content: {
          title: 'Tu turno se acerca',
          body: `En una hora tienes un turno de ${item.turno.tipo} para ${item.turno.mascota.nombre} en ${item.turno.sede}.`,
          data: { huella: item.huella, turnoId: item.turno.id },
          sound: 'default',
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: item.fecha, channelId: 'default' },
      });
    }
  }).catch((error: unknown) => { console.warn('No se pudieron sincronizar los recordatorios locales:', error); });
}

export function cancelarRecordatorios(): Promise<void> {
  if (Platform.OS === 'web') return Promise.resolve();
  return encolar(async () => {
    const Notifications = await import('expo-notifications');
    const programados = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(programados.filter((item) => item.identifier.startsWith(PREFIJO)).map((item) => Notifications.cancelScheduledNotificationAsync(item.identifier)));
  }).catch((error: unknown) => { console.warn('No se pudieron cancelar los recordatorios locales:', error); });
}
