export type Mascota = {
  id: number;
  nombre: string;
  especie: string;
  edad: string;
};

export type Cita = {
  id: number;
  mascota: string;
  motivo: string;
  fecha: string;
};

export type TurnoGuardado = {
  id: number;
  tipo: string;
  sede: SedeVeterinaria;
  fecha: string;
  hora: string;
  mascotaId: number;
  mascota: {
    id: number;
    nombre: string;
    especie: string;
    raza: string | null;
    foto: string | null;
  };
};

export const sedesVeterinaria = ['Recoleta', 'San Isidro', 'Vicente López'] as const;

export type SedeVeterinaria = (typeof sedesVeterinaria)[number];

export function esSedeVeterinaria(value: unknown): value is SedeVeterinaria {
  return typeof value === 'string' && sedesVeterinaria.some((sede) => sede === value);
}

export function formatearFechaTurno(fecha: string, hora: string): string {
  const [year, month, day] = fecha.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return `${date.toLocaleDateString('es-AR')} · ${hora}`;
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

export function descripcionEspecieMascota(especie: string, raza?: string | null): string {
  if (especie.trim().toLocaleLowerCase() === 'otro') {
    return raza?.trim() ?? '';
  }
  return especie.trim();
}

export const usuario = {
  id: 1,
  nombre: 'Juan Perez',
  email: 'juan@gmail.com',
};

export const fotoMascota =
  'https://images.unsplash.com/photo-1552053831-71594a27632d?w=900&auto=format&fit=crop&q=85';

export const mascotas: Mascota[] = [
  { id: 1, nombre: 'Lola', especie: 'Perro', edad: '3 años' },
  { id: 2, nombre: 'Mora', especie: 'Gato', edad: '2 años' },
  { id: 3, nombre: 'Tito', especie: 'Perro', edad: '5 años' },
  { id: 4, nombre: 'Pepe', especie: 'Perro', edad: '4 años' },
];

export const citas: Cita[] = [
  { id: 1, mascota: 'Lola', motivo: 'Vacuna Antirrábica', fecha: '28 Sept - 10:00 AM' },
  { id: 2, mascota: 'Mora', motivo: 'Control de rutina', fecha: '02 Oct - 16:30 PM' },
  { id: 3, mascota: 'Pepe', motivo: 'Control de rutina', fecha: '12 Oct - 6:30 AM' },
];