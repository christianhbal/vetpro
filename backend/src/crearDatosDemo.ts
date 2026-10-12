import path from 'node:path';
import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';

config({ path: path.resolve(__dirname, '..', '.env') });

const prisma = new PrismaClient();

const sedesVeterinaria = ['Recoleta', 'San Isidro', 'Vicente López'] as const;

type Tipo = 'Control' | 'Vacunas' | 'Estética';

function fechaComoValor(fecha: Date): string {
  return [
    fecha.getFullYear(),
    String(fecha.getMonth() + 1).padStart(2, '0'),
    String(fecha.getDate()).padStart(2, '0'),
  ].join('-');
}

// Todos los turnos de ejemplo son de HOY, sin importar el dia que sea. Las dos
// listas de la pantalla de Turnos ("Turnos siguientes" y "Turnos completados")
// muestran el dia en curso, y si los ejemplos se repartieran en fechas futuras
// se verian mezclados con los de hoy.
/** Mascota.userId es opcional, pero un turno siempre necesita un dueño. */
function tieneDueno<T extends { userId: number | null }>(
  mascota: T
): mascota is T & { userId: number } {
  return mascota.userId !== null;
}

//   Vicente Lopez inicio del dia: la manana llena de turnos por venir, todavia
//                           no se atendio ninguno y llegaron los primeros.
//   Recoleta      hora pico: la tarde llena de gente esperando en la sala.
//   San Isidro    final del dia: se atendio todo, no queda ningun turno por
//                           delante y no hay nadie esperando.
//
// "llegan" es cuantos de los pendientes ya escanearon el QR. Es lo unico que
// decide si el turno aparece en "Atender pacientes": sin llegada no hay nadie
// en la sala, aunque el turno exista y se vea en "Turnos siguientes".
//
// Se cuentan los primeros de la lista, que son los de menor hora: los que
// llegaron antes son los que tenian turno antes.
//
// Los horarios de cada sede no se repiten: completados y pendientes comparten
// el mismo dia, asi que dos turnos a la misma hora en la misma sede serian una
// doble reserva.
const PERFILES: Record<
  string,
  {
    pendientes: readonly string[];
    completados: readonly string[];
    llegan: number;
  }
> = {
  'Vicente López': {
    // Nadie fue atendido todavia: la jornada arranca.
    completados: [],
    pendientes: [
      '10:00',
      '10:30',
      '11:00',
      '11:30',
      '12:00',
      '13:00',
      '13:30',
      '14:00',
      '14:30',
      '15:00',
    ],
    llegan: 2,
  },
  Recoleta: {
    // Ya se atendio toda la manana y quedo la tarde llena.
    completados: ['10:00', '11:30', '13:00', '14:00', '15:00'],
    pendientes: ['16:30', '17:00', '17:30', '18:00', '18:30'],
    llegan: 3,
  },
  'San Isidro': {
    // Se termino la jornada entera: no queda nada por delante.
    completados: [
      '10:00',
      '11:00',
      '12:00',
      '13:00',
      '14:00',
      '15:00',
      '16:00',
      '17:00',
      '18:00',
      '18:30',
    ],
    pendientes: [],
    llegan: 0,
  },
};

// Una descripcion distinta por turno completado. Para que el detalle de cada
// tarjeta no se vea repetido, cada tipo tiene cinco textos diferentes y se van
// recorriendo en orden. Los pendientes van sin descripcion: todavia no
// occurredio nada que anotar.
const DESCRIPCIONES: Record<Tipo, readonly string[]> = {
  Control: [
    'Control de peso y vacunacion al dia. La mascota esta activa y sin sintomas.',
    'Revision de dientes y encias. Se recomienda continuar con la dieta habitual.',
    'Control post quirurgico. La herida cierra bien, sin signos de infeccion.',
    'Control de hidratacion y temperatura. Todo dentro de los parametros normales.',
'Revision de movilidad y reflejos. Se sugiere repetir el control en tres meses.',
    'Control de piel y orejas. Todo en orden, se sigue con la misma dieta.',
    'Pesaje de control y revision de la denticion. Proxima vez en seis meses.',
  ],
  Vacunas: [
    'Se aplico la vacuna anual y la mascota quedo tranquila, sin reaccion.',
    'Vacuna antirrabica al dia. La proxima dosis va en doce meses.',
    'Se completo el esquema de vacunas. La proxima visita es en un año.',
    'Vacuna contra la leptospirosis aplicada. Sin efectos adversos.',
    'Desparasitacion trimestral junto con la vacuna. Vuelve en tres meses.',
    'Vacuna anual aplicada sin reaccion. La mascota se fue tranquila.',
    'Desparasitacion y vacuna al dia. Proxima dosis en tres meses.',
  ],
  'Estética': [
    'Baño y corte. Se dejo comentario sobre el pelo para la proxima visita.',
    'Limpieza de oidos y corte de uñas. La mascota quedo tranquila.',
    'Corte de pelo y limpieza de dientes. Sin cambios en la piel.',
    'Baño medicado porque venia con una irritacion leve. Continua bien.',
    'Arrasado y corte de garras. Recomendamos repetir cada seis semanas.',
    'Corte de pelo y limpieza de oidos. Sin irritacion en la piel.',
    'Baño, corte y corte de unas. Todo listo para la proxima visita.',
  ],
};

const TIPOS: readonly Tipo[] = ['Control', 'Vacunas', 'Estética'];

async function main(): Promise<void> {
  const hoy = new Date();

  const anteriores = await prisma.turno.deleteMany({ where: { esDemo: true } });
  if (anteriores.count > 0) {
    console.log(`Se borraron ${anteriores.count} turnos de ejemplo previos.`);
  }

  // Se reparten las mascotas que ya tienen foto para que las tarjetas no se
  // vean todas con la misma imagen. Si no hay al menos dos con foto, se usan
  // todas las que haya.
  const conFoto = await prisma.mascota.findMany({
    where: { foto: { not: null } },
    select: { id: true, userId: true, nombre: true },
    orderBy: { id: 'asc' },
  });
  const candidatas = (
    conFoto.length > 1
      ? conFoto
      : await prisma.mascota.findMany({
          select: { id: true, userId: true, nombre: true },
          orderBy: { id: 'asc' },
        })
  ).filter(tieneDueno);
  if (candidatas.length === 0) {
    throw new Error('No hay mascotas con dueño en la base. Registra al menos una primero.');
  }

  const ejemplos: {
    tipo: Tipo;
    sede: string;
    hora: string;
    fecha: string;
    minutosAtras: number;
    llego: boolean;
    atendido: boolean;
    descripcion: string | null;
  }[] = [];

  const usadosPorTipo: Record<Tipo, number> = { Control: 0, Vacunas: 0, 'Estética': 0 };
  const proximaDescripcion = (tipo: Tipo): string => {
    const textos = DESCRIPCIONES[tipo];
    const texto = textos[usadosPorTipo[tipo] % textos.length];
    usadosPorTipo[tipo] += 1;
    return texto;
  };

  for (const sede of sedesVeterinaria) {
    const perfil = PERFILES[sede];

    // Solo los primeros "llegan" pendientes escanearon el QR. Los demas existen y
    // se ven en "Turnos siguientes", pero todavia no llegaron a la sala.
    perfil.pendientes.forEach((hora, i) => {
      const tipo = TIPOS[i % TIPOS.length];
      ejemplos.push({
        tipo,
        sede,
        hora,
        fecha: fechaComoValor(hoy),
        minutosAtras: 5 + i * 6,
        llego: i < perfil.llegan,
        atendido: false,
        descripcion: null,
      });
    });

    // Los completados son del mismo dia, asi que la seccion "Turnos completados"
    // tenga algo para mostrar.
    perfil.completados.forEach((hora, i) => {
      const tipo = TIPOS[i % TIPOS.length];
      ejemplos.push({
        tipo,
        sede,
        hora,
        fecha: fechaComoValor(hoy),
        minutosAtras: 40 + i * 25,
        llego: perfil.llegan > 0,
        atendido: true,
        descripcion: proximaDescripcion(tipo),
      });
    });
  }

  const creados: {
    id: number;
    dueno: string;
    mascota: string;
    conFoto: boolean;
    sede: string;
    fecha: string;
    hora: string;
    llego: boolean;
    atendido: boolean;
    conDescripcion: boolean;
  }[] = [];

// Un nombre no puede caer en el mismo horario de la misma sede dos veces. La
// reserva va por nombre y no por id porque hay dos mascotas distintas que se
// llaman igual (dos "mati", dos "jorge") y en la tarjeta solo se ve el
// nombre. Sin esto, "mati 17:00" salia una vez en cada lista.
  const reservasPorHorario = new Map<string, Set<string>>();

  for (const [indice, ejemplo] of ejemplos.entries()) {
    // Se rota sobre todas las candidatas: con dos o mas fotos, dos turnos
    // seguidos nunca muestran la misma imagen.
    const clave = `${ejemplo.sede}|${ejemplo.fecha}|${ejemplo.hora}`;
    const yaReservadas = reservasPorHorario.get(clave) ?? new Set<string>();
    reservasPorHorario.set(clave, yaReservadas);

    let mascota = candidatas[indice % candidatas.length];
    for (let salto = 0; salto < candidatas.length && yaReservadas.has(mascota.nombre); salto += 1) {
      mascota = candidatas[(indice + salto + 1) % candidatas.length];
    }
    yaReservadas.add(mascota.nombre);

    const llegada = new Date(Date.now() - ejemplo.minutosAtras * 60 * 1000).toISOString();
    const turno = await prisma.turno.create({
      data: {
        tipo: ejemplo.tipo,
        sede: ejemplo.sede,
        fecha: ejemplo.fecha,
        hora: ejemplo.hora,
        llegadaEn: ejemplo.llego ? llegada : null,
        // Sin llegada no hay nadie esperando, pero el turno puede estar atendido: en
        // una sede que ya cerro la jornada la llegada queda vacia y el
        // atendido sigue puesto.
        atendidoEn: ejemplo.atendido ? llegada : null,
        descripcion: ejemplo.descripcion,
        esDemo: true,
        user: { connect: { id: mascota.userId } },
        mascota: { connect: { id: mascota.id } },
      },
      include: {
        user: { select: { nombre: true } },
        mascota: { select: { nombre: true, foto: true } },
      },
    });
    creados.push({
      id: turno.id,
      dueno: turno.user.nombre,
      mascota: turno.mascota.nombre,
      conFoto: Boolean(turno.mascota.foto),
      sede: turno.sede,
      fecha: turno.fecha,
      hora: turno.hora,
      llego: ejemplo.llego,
      atendido: ejemplo.atendido,
      conDescripcion: ejemplo.descripcion !== null,
    });
  }

  console.log(`\nSe crearon ${creados.length} turnos de ejemplo:\n`);
  for (const turno of creados) {
    const estado = turno.atendido
      ? 'COMPLETADO'
      : turno.llego
        ? 'EN SALA  '
        : 'SIGUIENTE';
    console.log(
      `  ${String(turno.id).padStart(4)}  ${estado}  ${turno.fecha} ${turno.hora}  ` +
        `${turno.sede.padEnd(13)} ${turno.mascota} (${turno.dueno})  ` +
        `foto: ${turno.conFoto ? 'si' : 'no'}  nota: ${turno.conDescripcion ? 'si' : 'no'}`
    );
  }
  // Resumen por sede: es lo que se ve en cada pantalla.
  console.log('\nResumen por sede:');
  console.log('  sede          Siguientes  Completados  En sala');
  for (const sede of sedesVeterinaria) {
    const deLaSede = creados.filter((turno) => turno.sede === sede);
    const cuenta = (predicado: (t: (typeof creados)[number]) => boolean) =>
      deLaSede.filter(predicado).length;
    console.log(
      `  ${sede.padEnd(13)}${String(cuenta((t) => !t.atendido)).padStart(11)}` +
        `${String(cuenta((t) => t.atendido)).padStart(13)}` +
        `${String(cuenta((t) => !t.atendido && t.llego)).padStart(10)}`
    );
  }

// Chequeos. Todos los ejemplos son de hoy y salen de las mascotas que ya hay
  // en la base, asi que tienen que cumplirse tres cosas: que no haya dos turnos
  // a la misma hora en la misma sede (seria una doble reserva), que en un mismo
  // horario no se repita un nombre (las tarjetas se verian iguales) y que
  // todas las mascotas tengan foto (si no, la tarjeta sale con la huellita).
  const sinFoto = creados.filter((turno) => !turno.conFoto);
  if (sinFoto.length > 0) {
    console.log(`\nOjo: ${sinFoto.length} turnos quedaron con una mascota sin foto:`);
    for (const turno of sinFoto) {
      console.log(`  ${turno.sede} ${turno.fecha} ${turno.hora}  ${turno.mascota}`);
    }
  } else {
    console.log('\nTodos los turnos tienen mascota con foto.');
  }

  const porHorario = new Map<string, string[]>();
  for (const turno of creados) {
    const clave = `${turno.sede}|${turno.fecha}|${turno.hora}`;
    const nombres = porHorario.get(clave) ?? [];
    nombres.push(turno.mascota);
    porHorario.set(clave, nombres);
  }

  const dobleReserva = [...porHorario.entries()].filter(([, nombres]) => nombres.length > 1);
  if (dobleReserva.length > 0) {
    console.log('\nOjo: hay dos turnos en el mismo horario de la misma sede:');
    for (const [clave, nombres] of dobleReserva) {
      console.log(`  ${clave}: ${nombres.join(', ')}`);
    }
  } else {
    console.log('\nSin doble reservas de horario.');
  }

  const fechasDistintas = [...new Set(creados.map((turno) => turno.fecha))];
  if (fechasDistintas.length > 1) {
    console.log(`\nOjo: se crearon turnos en varios dias: ${fechasDistintas.join(', ')}`);
  }

  console.log('\nPara borrarlos: npm run db:demo:borrar');
}

main()
  .catch((error: unknown) => {
    console.error('No se pudieron crear los turnos de ejemplo:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());