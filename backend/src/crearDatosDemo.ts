import path from 'node:path';
import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { HORARIOS } from './horarios';

config({ path: path.resolve(__dirname, '..', '.env') });

const prisma = new PrismaClient();

const sedesVeterinaria = ['Recoleta', 'San Isidro', 'Vicente López'] as const;

type Tipo = 'Control' | 'Vacunas' | 'Estética';

/**
 * Cliente de la demo.
 *
 * Sus turnos los arma clienteTurnosDemo.ts y no este script: son los que el
 * dueño ve en su pantalla de Turnos y los tiene que poder cancelar el
 * veterinario, asi que son filas de verdad. Si tambien se armaran aca, cada
 * mascota tendria dos turnos para hoy y la agenda del admin mostraria el
 * doble.
 */
const CLIENTE_DEMO = 'chris2@gmail.com';

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

//   San Isidro    inicio del dia: la manana llena de turnos por venir, todavia
//                           no se atendio ninguno y llegaron los primeros.
//   Recoleta      hora pico: la tarde llena de gente esperando en la sala.
//   Vicente Lopez final del dia: se atendio todo, no queda ningun turno por
//                           delante y no hay nadie esperando.
//
// San Isidro no tiene completados a proposito: es la sede del comienzo del
// dia. En el Historial igual aparecen turnos suyos, porque los dias fijos de
// abajo (sabado y miercoles) se arman para las tres sedes.
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
  'San Isidro': {
    // Comienzo del dia: nadie fue atendido todavia, la jornada arranca.
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
    // Hora pico: ya se atendio toda la manana y quedo la tarde llena.
    completados: ['10:00', '11:30', '13:00', '14:00', '15:00'],
    pendientes: ['16:30', '17:00', '17:30', '18:00', '18:30'],
    llegan: 3,
  },
  'Vicente López': {
    // Final del dia: se termino la jornada entera, no queda nada por delante.
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

// Ademas de los turnos del dia, se crean algunos ATENDIDOS en el sabado y el
// miercoles mas recientes. Llevan fecha fija, asi que no se mueven al cambiar la
// semana: el Historial siempre tiene esos dias con contenido.
//
//   dia: getDay() -> 3 miercoles, 6 sabado
//   porSede: cuantos turnos con descripcion se crean en cada sede
const DIAS_FIJOS: { nombre: string; dia: number; porSede: number }[] = [
  { nombre: 'sabado', dia: 6, porSede: 2 },
  { nombre: 'miercoles', dia: 3, porSede: 2 },
];

// En los dias fijos no se usan horas fijas: el sabado mas reciente puede venir
// ya lleno con los turnos del dia. Se buscan los primeros horarios libres de
// cada sede, asi nunca hay doble reserva.
/** El dia de la semana mas reciente que ya paso (no cuenta el de hoy). */
function ultimoDiaDeLaSemana(diaSemana: number, desde: Date): Date {
  const cursor = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate());
  cursor.setDate(cursor.getDate() - 1);
  while (cursor.getDay() !== diaSemana) {
    cursor.setDate(cursor.getDate() - 1);
  }
  return cursor;
}

async function main(): Promise<void> {
  const ahora = new Date();

  // La veterinaria no atiende los domingos. Si hoy es domingo, los ejemplos van
  // el sabado anterior: ponerlos en domingo seria inventar turnos en un dia
  // cerrado, y el Historial los oculta.
  const esHoyDomingo = ahora.getDay() === 0;
  const diaEjemplos = esHoyDomingo
    ? new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() - 1)
    : ahora;

  const anteriores = await prisma.turno.deleteMany({ where: { esDemo: true } });
  if (anteriores.count > 0) {
    console.log(`Se borraron ${anteriores.count} turnos de ejemplo previos.`);
  }

  // Solo se usan mascotas CON foto: la tarjeta del historial muestra la foto
  // para reconocer rapido al paciente, y una mascota sin foto deja el hueco de
  // la huellita.
  //
  // Las del cliente de la demo quedan afuera: sus turnos los arma
  // clienteTurnosDemo.ts. Si entraran tambien aca, cada una tendria un turno
  // para hoy de mas y la agenda del admin mostraria el doble de gente.
  const conFoto = await prisma.mascota.findMany({
    where: { foto: { not: null }, user: { email: { not: CLIENTE_DEMO } } },
    select: { id: true, userId: true, nombre: true },
    orderBy: { id: 'asc' },
  });
  const candidatas = conFoto.filter(tieneDueno);
  if (candidatas.length === 0) {
    throw new Error(
      'No hay mascotas con dueño y foto en la base. Carga al menos una foto antes de generar los ejemplos.'
    );
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
        fecha: fechaComoValor(diaEjemplos),
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
        fecha: fechaComoValor(diaEjemplos),
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

/**
 * Mascotas que siempre van a la misma sede.
 *
 * El reparto es rotatorio: si no, cada mascota cae en las tres sedes y en la
 * agenda no se ve nunca que un dueño tiene a su paciente siempre en el mismo
 * lugar. Con esto Chloe queda en San Isidro y el resto se sigue repartiendo.
 */
const SEDEFIJA_POR_MASCOTA: Record<string, string> = {
  Chloe: 'San Isidro',
};

/** La sede donde esa mascota va siempre, o null si va a donde toque. */
function sedeFijaDe(nombre: string): string | null {
  return SEDEFIJA_POR_MASCOTA[nombre] ?? null;
}

/**
 * Mascotas que pueden caer en esa sede.
 *
 * La anclada a una sede entra PRIMERO y siempre: eso es lo que garantiza el
 * anclaje, que no se vaya a otra. Pero no es la unica de esa sede: si lo fuera,
 * en San Isidro (que abre con diez turnos de []) los diez eran de Chloe y la
 * agenda de la manana salia con la misma foto repetida. Con las libres sumadas
 * al lado, la anclada sigue yendo siempre ahi y las demas se reparten.
 */
function candidatasPara<T extends { nombre: string }>(candidatas: T[], sede: string): T[] {
  // Las ancladas a otra sede no pueden venir: no es solo una preferencia, si no
  // se cumple el turno queda de una mascota en una sede a la que nunca va.
  const libres = candidatas.filter((c) => sedeFijaDe(c.nombre) === null);
  const deEstaSede = candidatas.filter((c) => sedeFijaDe(c.nombre) === sede);
  if (deEstaSede.length === 0) return libres.length > 0 ? libres : candidatas;
  return [...deEstaSede, ...libres];
}

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

    const paraEstaSede = candidatasPara(candidatas, ejemplo.sede);
    let mascota = paraEstaSede[indice % paraEstaSede.length];
    for (
      let salto = 0;
      salto < paraEstaSede.length && yaReservadas.has(mascota.nombre);
      salto += 1
    ) {
      mascota = paraEstaSede[(indice + salto + 1) % paraEstaSede.length];
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

  // Turnos atendidos con fecha fija en el sabado y el miercoles mas recientes.
  // Van todos con descripcion y con mascota con foto, asi que el Historial los
  // muestra completos.
  let indiceFijo = 0;
  for (const diaFijo of DIAS_FIJOS) {
    const fecha = fechaComoValor(ultimoDiaDeLaSemana(diaFijo.dia, ahora));

    for (const sede of sedesVeterinaria) {
      const usados = new Set<string>();

      // Se leen los horarios que ya hay en esa fecha y esa sede (contando los
      // turnos del dia recien creados) y se toman los primeros libres.
      const yaOcupados = await prisma.turno.findMany({
        where: { sede, fecha },
        select: { hora: true },
      });
      const libres = HORARIOS.filter(
        (hora) => !yaOcupados.some((turno) => turno.hora === hora)
      );

      for (let i = 0; i < Math.min(diaFijo.porSede, libres.length); i += 1) {
        const hora = libres[i];

        const paraEstaSede = candidatasPara(candidatas, sede);
        let mascota = paraEstaSede[indiceFijo % paraEstaSede.length];
        for (
          let salto = 0;
          salto < paraEstaSede.length && usados.has(mascota.nombre);
          salto += 1
        ) {
          mascota = paraEstaSede[(indiceFijo + salto + 1) % paraEstaSede.length];
        }
        usados.add(mascota.nombre);
        indiceFijo += 1;

        const tipo = TIPOS[indiceFijo % TIPOS.length];
        const turno = await prisma.turno.create({
          data: {
            tipo,
            sede,
            fecha,
            hora,
            // Sin llegada ni atendidoEn: estos turnos son solo historial. Si
            // vinieran con llegada, "Atender pacientes" los contaria como
            // gente en la sala (el endpoint incluye los esDemo sin mirar la
            // fecha) y each sede se passes de 3.
            llegadaEn: null,
            // El Historial se guia por la descripcion, asi que estos turnos si
            // aparecen ahi. La pantalla Turnos cuenta completados por
            // atendidoEn, y San Isidro tiene que verse con cero porque es
            // la sede del comienzo del dia.
            atendidoEn: null,
            descripcion: proximaDescripcion(tipo),
            esDemo: true,
            // Son historial, no agenda. Sin esto San Isidro aparecia con 14
            // turnos siguientes en vez de 10, y con horas repetidas.
            ocultoEnAgenda: true,
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
          llego: false,
          // Ni llegada ni atendidoEn: solo historial. El Historial los muestra
          // igual por la descripcion.
          atendido: false,
          conDescripcion: true,
        });
      }
    }
  }

  // Turnos YA ATENDIDOS de los ultimos dias habil, en las tres sedes.
  //
  // Antes estos dias se veian desde el frontend, con nombres inventados
  // (Lola, Mora, Roco) y duenos que no eran de nadie (Ana Gomez, Bruno Diaz).
  // La agenda es del veterinario: tiene que mostrar los pacientes reales, con su
  // nombre y su foto, asi que los historiales salen de la base.
  const DIAS_PASADOS = 4;
  const POR_SEDE_Y_DIA = 2;
  let indicePasado = 0;
  for (let dia = 1; dia <= DIAS_PASADOS; dia += 1) {
    const cursor = new Date(
      ahora.getFullYear(),
      ahora.getMonth(),
      ahora.getDate() - dia
    );
    if (cursor.getDay() === 0) continue;
    const fecha = fechaComoValor(cursor);

    for (const sede of sedesVeterinaria) {
      // Se leen los horarios que ya hay en esa fecha y esa sede (contando los del
      // dia recien creados) y se toman los primeros libres.
      const yaOcupados = await prisma.turno.findMany({
        where: { sede, fecha },
        select: { hora: true },
      });
      const libres = HORARIOS.filter(
        (hora) => !yaOcupados.some((turno) => turno.hora === hora)
      );

      const usados = new Set<string>();
      for (let i = 0; i < Math.min(POR_SEDE_Y_DIA, libres.length); i += 1) {
        const hora = libres[i];

        const paraEstaSede = candidatasPara(candidatas, sede);
        let mascota = paraEstaSede[indicePasado % paraEstaSede.length];
        for (
          let salto = 0;
          salto < paraEstaSede.length && usados.has(mascota.nombre);
          salto += 1
        ) {
          mascota = paraEstaSede[(indicePasado + salto + 1) % paraEstaSede.length];
        }
        usados.add(mascota.nombre);
        indicePasado += 1;

        const tipo = TIPOS[indicePasado % TIPOS.length];
        const momento = new Date(`${fecha}T${hora}:00`).toISOString();
        const turno = await prisma.turno.create({
          data: {
            tipo,
            sede,
            fecha,
            hora,
            llegadaEn: momento,
            // Atendidos, con la nota que dejo la veterinaria: asi la lista de
            // un dia ya pasado sale con el sello "Atendido" y su descripcion.
            atendidoEn: momento,
            descripcion: proximaDescripcion(tipo),
            esDemo: true,
            // A diferencia de los dias fijos de arriba, estos SI se ven: son los
            // que el veterinario revisa al abrir un dia pasado.
            ocultoEnAgenda: false,
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
          llego: true,
          atendido: true,
          conDescripcion: true,
        });
      }
    }
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

  // El Historial solo muestra turnos con descripcion. Cada sede tiene al menos 4,
  // pero en San Isidro no vienen de los completados del dia (que es cero a
  // proposito): vienen de los dias fijos de sabado y miercoles.
  console.log('\nTurnos con descripcion por sede (lo que ve el Historial):');
  for (const sede of sedesVeterinaria) {
    const deLaSede = creados.filter((turno) => turno.sede === sede);
    const conNota = deLaSede.filter((turno) => turno.conDescripcion).length;
    const deFijos = deLaSede.filter((turno) => turno.fecha !== fechaComoValor(diaEjemplos)).length;
    const marca = conNota >= 4 ? '' : '   <-- MENOS DE 4';
    console.log(
      `  ${sede.padEnd(13)}${conNota}${marca}   (del dia: ${conNota - deFijos}, de sabado/miercoles: ${deFijos})`
    );
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

  // Si los ejemplos quedaron en un domingo seria un turno inventado en un dia
  // en que la veterinaria esta cerrada.
  const enDomingo = [...new Set(fechasDistintas)].filter(
    (fecha) => new Date(`${fecha}T12:00:00`).getDay() === 0
  );
  if (enDomingo.length > 0) {
    console.log(`\nOjo: se crearon turnos en domingo: ${enDomingo.join(', ')}`);
  }

  if (esHoyDomingo) {
    console.log(
      `\nHoy es domingo, asi que los ejemplos se generaron del ` +
        `${fechaComoValor(diaEjemplos)} (sabado). La pantalla de Turnos muestra el ` +
        `dia de hoy y hoy no hay nada agendado.`
    );
  }

  console.log('\nPara borrarlos: npm run db:demo:borrar');
}

main()
  .catch((error: unknown) => {
    console.error('No se pudieron crear los turnos de ejemplo:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());