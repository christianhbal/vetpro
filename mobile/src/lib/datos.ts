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

export const sedesVeterinaria = ['Recoleta', 'San Isidro', 'Vicente López'] as const;

export type SedeVeterinaria = (typeof sedesVeterinaria)[number];

export const direccionesSedes: Record<SedeVeterinaria, string> = {
  Recoleta: 'Av. Recoleta 1234',
  'San Isidro': 'Av. Centenario 2450',
  'Vicente López': 'Av. del Libertador 1580',
};

export const DIAS_SEMANA = ['L', 'M', 'M', 'J', 'V', 'S', 'D'] as const;

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