import type { SedeVeterinaria, TurnoGuardado } from '@/lib/datos';

// Mascota del usuario, tal como la devuelve /api/mascotas.
export type MascotaEjemplo = {
  id: number;
  nombre: string;
  especie?: string | null;
  raza?: string | null;
  foto?: string | null;
};

export type TurnoEjemplo = TurnoGuardado & {
  /** Marca que el turno es de relleno: no viene de la API. */
  esDemo: true;
  /** Ya atendido por la veterinaria. */
  atendidoEn: string | null;
  /** No se lista en la agenda, solo ocupa el calendario. */
  ocultoEnAgenda: boolean;
  user?: { nombre: string } | null;
};

// Motivos de los turnos de HOY: dos por mascota y SIN descripcion. Son los que
// el usuario tiene agendados, asi que quedan pendientes.
const MOTIVOS_HOY = [{ tipo: 'Vacunas' }, { tipo: 'Control' }];

// Motivos del ULTIMO VIERNES: dos por mascota, CON descripcion y ya atendidos.
// Los turnos con descripcion son los que dejo la veterinaria al atender.
// Los tipos son los unicos tres que valida el backend: Control, Vacunas y
// Estetica. No inventar otros, que despues el POST los rechaza.
const MOTIVOS_VIERNES = [
  {
    tipo: 'Vacunas',
    descripcion:
      'Vacunación anual aplicada. Sin reacciones en consulta. Recordar la próxima dosis en doce meses.',
  },
  {
    tipo: 'Control',
    descripcion:
      'Control postoperatorio. La herida se ve bien y no hay signos de infección. Continuar el antibiótico hasta completar la tanda.',
  },
  {
    tipo: 'Estética',
    descripcion:
      'Baño y corte. Se fue tranquilo, sin que se estrese. Volver en seis semanas para el recorte de rutina.',
  },
];

// La veterinaria atiende de lunes a sabado y los miercoles estan completos.
const DIAS_SIN_ATENCION = new Set([0, 3]);
const DIA_VIERNES = 5;

function esDiaHabil(fecha: Date): boolean {
  return !DIAS_SIN_ATENCION.has(fecha.getDay());
}

function fechaComoValor(fecha: Date): string {
  return [
    fecha.getFullYear(),
    String(fecha.getMonth() + 1).padStart(2, '0'),
    String(fecha.getDate()).padStart(2, '0'),
  ].join('-');
}

export function fechaHabilAnterior(): string {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() - 1);
  while (!esDiaHabil(fecha)) {
    fecha.setDate(fecha.getDate() - 1);
  }
  return fechaComoValor(fecha);
}

// Ultimo dia habil del dia de semana dado, anterior a hoy. Con el 5 devuelve el
// viernes previo. Siempre cae en una fecha ya pasada, asi que el turno sale
// como atendido.
export function ultimoDiaDeSemana(diaSemana: number): string {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() - 1);
  while (fecha.getDay() !== diaSemana || !esDiaHabil(fecha)) {
    fecha.setDate(fecha.getDate() - 1);
  }
  return fechaComoValor(fecha);
}

// Franja horaria de la veterinaria: de 10:00 a 18:30 cada media hora. Es el
// mismo rango que valida el backend.
const PRIMER_HORARIO = 10 * 60;
const ULTIMO_HORARIO = 18 * 60 + 30;
const PASO_HORARIO = 30;

function horaDesdeMinutos(minutos: number): string {
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return `${String(horas).padStart(2, '0')}:${String(resto).padStart(2, '0')}`;
}

// Una hora distinta por turno, avanzando media hora y volviendo al inicio
// cuando se termina la franja. Con la hora fija en el motivo, dos mascotas
// daban Vacunas al mismo horario y la lista se leia como un error de datos.
export function horariosEjemplo(cantidad: number): string[] {
  const disponibles: string[] = [];
  for (
    let minutos = PRIMER_HORARIO;
    minutos <= ULTIMO_HORARIO;
    minutos += PASO_HORARIO
  ) {
    disponibles.push(horaDesdeMinutos(minutos));
  }
  return Array.from({ length: cantidad }, (_vacio, indice) => disponibles[indice % disponibles.length]);
}

/**
 * Sede de ejemplo de cada mascota.
 *
 * Sin esto todos los turnos de relleno salen en Recoleta: el filtro de sede de
 * la pantalla de Turnos muestra un solo chip y parece que la veterinaria tiene
 * una sola direccion. Se elige UNA sede por mascota y no una por turno porque a
 * la misma mascota no se la lleva a dos veterinarias distintas el mismo dia.
 *
 * Las que no estan en la lista caen por posicion, asi un cliente con otras
 * mascotas tambien ve las tres sedes.
 */
const SEDE_POR_MASCOTA: Record<string, SedeVeterinaria> = {
  Tito: 'Recoleta',
  Jorge: 'Recoleta',
  Chloe: 'San Isidro',
  Marcos: 'Vicente López',
};

const SEDES_EJEMPLO: SedeVeterinaria[] = ['Recoleta', 'San Isidro', 'Vicente López'];

function sedeEjemploDe(mascota: MascotaEjemplo, indiceMascota: number): SedeVeterinaria {
  return SEDE_POR_MASCOTA[mascota.nombre] ?? SEDES_EJEMPLO[indiceMascota % SEDES_EJEMPLO.length];
}

/**
 * Turnos de relleno del CLIENTE, armados con sus propias mascotas.
 *
 * Dos por mascota el dia de hoy (sin descripcion, pendientes) y dos el ultimo
 * viernes (con descripcion, atendidos). Las fechas se calculan en cada llamada
 * contra la fecha actual, asi que los ejemplos persisten sin guardarse en
 * ningun lado: si el usuario vuelve manana, el viernes se corre solo para
 * seguir siendo el anterior.
 *
 * Vive en lib/ y no en la pantalla para que Turnos y la portada muestren
 * exactamente los mismos datos: antes cada una armaba los suyos y se veian
 * turnos distintos en la misma app.
 */
export function turnosEjemploCliente(mascotas: MascotaEjemplo[]): TurnoEjemplo[] {
  const hoy = fechaComoValor(new Date());
  const viernes = ultimoDiaDeSemana(DIA_VIERNES);
  const total = mascotas.length * (MOTIVOS_HOY.length + MOTIVOS_VIERNES.length);
  const horas = horariosEjemplo(total);

  const base = (mascota: MascotaEjemplo, idTurno: number, sede: SedeVeterinaria) => ({
    sede,
    esDemo: true as const,
    ocultoEnAgenda: false,
    mascotaId: idTurno,
    // El dueno no se muestra en la agenda del cliente: es el mismo.
    user: null,
    mascota: {
      id: idTurno,
      nombre: mascota.nombre,
      especie: mascota.especie ?? 'Mascota',
      raza: mascota.raza ?? null,
      foto: mascota.foto ?? null,
    },
  });

  const pendientes = mascotas.flatMap((mascota, indiceMascota) =>
    MOTIVOS_HOY.map((motivo, indiceMotivo) => {
      const indice = indiceMascota * MOTIVOS_HOY.length + indiceMotivo;
      const idTurno = -3000 - indice;
      return {
        id: idTurno,
        ...base(mascota, idTurno, sedeEjemploDe(mascota, indiceMascota)),
        tipo: motivo.tipo,
        fecha: hoy,
        hora: horas[indice],
        llegadaEn: null,
        // Sin atender: sigue pendiente.
        atendidoEn: null,
        descripcion: null,
      };
    })
  );

  // Los motivos se reparten por indice GLOBAL, no por mascota: asi el primero
  // de la segunda mascota no repite el motivo de la primera.
  const atendidos = mascotas.flatMap((mascota, indiceMascota) =>
    MOTIVOS_VIERNES.map((motivo, indiceMotivo) => {
      // Siguen a los de hoy en el reparto de horarios, asi que no se pisan.
      const indice =
        mascotas.length * MOTIVOS_HOY.length + indiceMascota * MOTIVOS_VIERNES.length + indiceMotivo;
      const idTurno = -3000 - indice;
      const momento = new Date(`${viernes}T${horas[indice]}:00`).toISOString();
      return {
        id: idTurno,
        ...base(mascota, idTurno, sedeEjemploDe(mascota, indiceMascota)),
        tipo: motivo.tipo,
        fecha: viernes,
        hora: horas[indice],
        llegadaEn: momento,
        // Atendido: ya lo hizo la veterinaria, por eso lleva descripcion.
        atendidoEn: momento,
        descripcion: motivo.descripcion,
      };
    })
  );

  return [...pendientes, ...atendidos];
}