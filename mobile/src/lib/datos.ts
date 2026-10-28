import { Linking } from 'react-native';

export type TurnoGuardado = {
  id: number;
  tipo: string;
  sede: SedeVeterinaria;
  fecha: string;
  hora: string;
  llegadaEn: string | null;
  descripcion: string | null;
  mascotaId: number;
  mascota: {
    id: number;
    nombre: string;
    especie: string;
    raza: string | null;
    foto: string | null;
  };
};

export type SedeVeterinaria = string;
export type Sede = { id: number; nombre: string; direccion: string; dias: string[]; horaDesde: string; horaHasta: string };
export const DIAS_SEMANA = ['L', 'M', 'M', 'J', 'V', 'S', 'D'] as const;
export function esSedeVeterinaria(value: unknown): value is SedeVeterinaria {
  return typeof value === 'string' && value.trim().length > 0;
}
export function horariosDeSede(sede: Sede | undefined): string[] {
  if (!sede) return [];
  const minutos = (hora: string) => { const [h, m] = hora.split(':').map(Number); return h * 60 + m; };
  const desde = minutos(sede.horaDesde), hasta = minutos(sede.horaHasta);
  if (!Number.isFinite(desde) || !Number.isFinite(hasta) || hasta <= desde) return [];
  const horarios: string[] = [];
  for (let valor = desde; valor + 30 <= hasta; valor += 30) horarios.push(`${String(Math.floor(valor / 60)).padStart(2, '0')}:${String(valor % 60).padStart(2, '0')}`);
  return horarios;
}
export function atiendeDia(sede: Sede | undefined, fecha: Date): boolean {
  return Boolean(sede?.dias.includes(['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab'][fecha.getDay()]));
}

export function formatearFechaTurno(fecha: string, hora: string): string {
  const [year, month, day] = fecha.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return `${date.toLocaleDateString('es-AR')} · ${hora}`;
}

/** Abre Google Maps con el camino a la sede; sirve en web y en el celular. */
export function abrirMapa(sede: string, direccion: string | undefined): void {
  const destino = encodeURIComponent([sede, direccion].filter(Boolean).join(', '));
  void Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${destino}`);
}

export function turnoSiguePendiente(turno: Pick<TurnoGuardado, 'fecha' | 'hora'>, ahora: Date): boolean {
  const [year, month, day] = turno.fecha.split('-').map(Number);
  const [hour, minute] = turno.hora.split(':').map(Number);
  const fechaHora = new Date(year, month - 1, day, hour, minute);

  return (
    Number.isFinite(fechaHora.getTime()) &&
    fechaHora.getFullYear() === year &&
    fechaHora.getMonth() === month - 1 &&
    fechaHora.getDate() === day &&
    fechaHora.getHours() === hour &&
    fechaHora.getMinutes() === minute &&
    fechaHora.getTime() >= ahora.getTime()
  );
}


export function nombreEspecieMascota(especie: string, raza?: string | null): string {
  const animal = especie.trim();
  if (animal.toLocaleLowerCase() === 'otro') return raza?.trim() ?? '';
  return animal;
}

//las pantallas que solo muestran el animal usannombreEspecieMascota.
export function descripcionEspecieMascota(especie: string, raza?: string | null): string {
  const animal = nombreEspecieMascota(especie, raza);
  const tipo = raza?.trim() ?? '';
  // Con "Otro" el tipo ES el animal, asi que no se repite ni se agrega.
  if (
    especie.trim().toLocaleLowerCase() === 'otro' ||
    !tipo ||
    tipo.toLocaleLowerCase() === animal.toLocaleLowerCase()
  ) {
    return animal;
  }
  return `${animal} · ${tipo}`;
}

export const ESPECIES_MASCOTA = ['Perro', 'Gato', 'Otro'] as const;
export const ESPECIE_OTRO = 'Otro';

/**
 * Sexo de una mascota.
 *
 * Son solo dos y no se inventan mas: el backend valida contra esta misma lista
 * en el POST y en el PATCH de mascotas.
 */
export const SEXOS_MASCOTA = ['Macho', 'Hembra'] as const;

export type SexoMascota = (typeof SEXOS_MASCOTA)[number];

export function esSexoMascota(value: unknown): value is SexoMascota {
  return typeof value === 'string' && SEXOS_MASCOTA.some((sexo) => sexo === value);
}

export function dividirEspecieMascota(
  especie: string,
  raza: string
): { seleccion: string; otra: string } {
  const valor = especie.trim();
  if (ESPECIES_MASCOTA.some((opcion) => opcion !== ESPECIE_OTRO && opcion === valor)) {
    return { seleccion: valor, otra: '' };
  }
  if (valor.toLocaleLowerCase() === ESPECIE_OTRO.toLocaleLowerCase()) {
    return { seleccion: ESPECIE_OTRO, otra: raza.trim() };
  }
  return { seleccion: ESPECIE_OTRO, otra: valor };
}

export function fechaNacimientoValida(valor: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const [anio, mes, dia] = valor.split('-').map(Number);
  const fecha = new Date(anio, mes - 1, dia);
  const hoy = new Date();
  return fecha.getFullYear() === anio && fecha.getMonth() === mes - 1 && fecha.getDate() === dia && fecha <= hoy;
}

export function edadDesdeNacimiento(valor: string): number | null {
  if (!fechaNacimientoValida(valor)) return null;
  const [anio, mes, dia] = valor.split('-').map(Number);
  const hoy = new Date();
  return hoy.getFullYear() - anio - (hoy.getMonth() + 1 < mes || (hoy.getMonth() + 1 === mes && hoy.getDate() < dia) ? 1 : 0);
}
