import path from 'node:path';
import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { HORARIOS } from './horarios';

config({ path: path.resolve(__dirname, '..', '.env') });

const prisma = new PrismaClient();

const CLIENTE = 'chris2@gmail.com';
const sedesVeterinaria = ['Recoleta', 'San Isidro', 'Vicente López'] as const;

type Tipo = 'Control' | 'Vacunas' | 'Estética';

/**
 * Turnos del dueño de la demo, y son de verdad.
 *
 * Antes la pantalla de Turnos del cliente los armaba el frontend con ids
 * negativos (los "ejemplos"), y eso hacia dos cosas malas: no eran filas de la
 * base, asi que el veterinario no podia cancelarlos desde la misma pantalla que
 * los veia, y la agenda del admin no los tenia. Ahora son filas normales, se
 * pueden cancelar, mover y avisar al dueño como cualquier otro turno.
 *
 * Son de HOY y del ultimo habil del viernes, igual que los ejemplos que
 * reemplazan: dos pendientes hoy por mascota y tres atendidos el viernes, con
 * la nota que dejo la veterinaria. Los de hoy van SIN llegada a proposito, para
 * que no entren en "Atender pacientes" (que tiene un tope de 3 por sede) y sigan
 * siendo cancelables desde la agenda.
 */

const MOTIVOS_HOY: Tipo[] = ['Vacunas', 'Control'];

/** Los textos son los mismos que usaba el ejemplo del frontend. */
const MOTIVOS_VIERNES: { tipo: Tipo; descripcion: string }[] = [
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

/**
 * Sede de cada mascota.
 *
 * Se escribe una por mascota a proposito: es la misma lista que usa la pantalla
 * para armar sus ejemplos, asi que lo que se ve en la agenda del admin y lo que
 * ve el dueño dicen lo mismo. Las que no esten en la lista caen por posicion.
 */
const SEDE_POR_MASCOTA: Record<string, string> = {
  Tito: 'Recoleta',
  Jorge: 'Recoleta',
  Chloe: 'San Isidro',
  Marcos: 'Vicente López',
};

function fechaComoValor(fecha: Date): string {
  return [
    fecha.getFullYear(),
    String(fecha.getMonth() + 1).padStart(2, '0'),
    String(fecha.getDate()).padStart(2, '0'),
  ].join('-');
}

/** Ultimo dia habil del viernes anterior a hoy. */
function ultimoViernes(hoy: Date): string {
  const cursor = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 1);
  while (cursor.getDay() !== 5) {
    cursor.setDate(cursor.getDate() - 1);
  }
  return fechaComoValor(cursor);
}

async function main(): Promise<void> {
  const cliente = await prisma.usuario.findUnique({
    where: { email: CLIENTE },
    select: { id: true, nombre: true },
  });
  if (!cliente) {
    throw new Error(`No existe el usuario ${CLIENTE}.`);
  }

  // Mismo orden que usa la pantalla: la API los manda del mas nuevo al mas
  // viejo, y los horarios se reparten en ese orden.
  const mascotas = await prisma.mascota.findMany({
    where: { userId: cliente.id, foto: { not: null } },
    orderBy: { createdAt: 'desc' },
  });
  if (mascotas.length === 0) {
    throw new Error('El cliente no tiene mascotas con foto.');
  }

  const hoy = fechaComoValor(new Date());
  const viernes = ultimoViernes(new Date());

  // Se borran los turnos del cliente de HOY y del viernes y se rehacen. No hace
  // falta ninguna marca en los datos: son las dos fechas que este script maneja,
  // y los turnos de otras fechas (los que el cliente agendo en la app) quedan
  // intactos. Antes se marcaba con un texto en la descripcion y se veía en
  // pantalla, adentro del cartel del turno.
  const borrados = await prisma.turno.deleteMany({
    where: { userId: cliente.id, fecha: { in: [hoy, viernes] } },
  });
  /**
   * Primer horario libre de esa sede para esa fecha.
   *
   * Se leen los que ya hay (contando los que se acaban de crear en este script)
   * y se toma el primero que este libre, igual que hacen los otros generadores.
   * Sin esto, el turno que dejo el aviso de proximidad tomaba las 10:30 de
   * Vicente Lopez y el script las volvia a usar: dos turnos de Marcos a la misma
   * hora en la misma sede.
   */
  async function primerHorarioLibre(
    sede: string,
    fecha: string,
    yaUsadas: Set<string>
  ): Promise<string | null> {
    const ocupados = await prisma.turno.findMany({
      where: { sede, fecha },
      select: { hora: true },
    });
    const tomado = new Set([...ocupados.map((turno) => turno.hora), ...yaUsadas]);
    return HORARIOS.find((hora) => !tomado.has(hora)) ?? null;
  }

  const usadasHoy = new Set<string>();
  const usadasViernes = new Set<string>();
  let sinEspacio = 0;

  for (const [indiceMascota, mascota] of mascotas.entries()) {
    const sede =
      SEDE_POR_MASCOTA[mascota.nombre] ??
      sedesVeterinaria[indiceMascota % sedesVeterinaria.length];

    for (const tipo of MOTIVOS_HOY) {
      const hora = await primerHorarioLibre(sede, hoy, usadasHoy);
      if (hora === null) {
        sinEspacio += 1;
        continue;
      }
      usadasHoy.add(hora);
      await prisma.turno.create({
        data: {
          tipo,
          sede,
          fecha: hoy,
          hora,
          llegadaEn: null,
          atendidoEn: null,
          // Sin descripcion: todavia no lo atendio nadie, asi que no hay nota.
          descripcion: null,
          // esDemo en true por dos razones, y las dos importan:
          //  1. la pantalla del cliente los muestra siempre, aunque su hora ya
          //     haya pasado. Sin esto, a la tarde la lista queda vacia.
          //  2. "npm run db:demo" borra los esDemo, asi que la ronda anterior se
          //     limpia sola antes de que este script rehaga la de hoy.
          // Lo que NO se usa es "esDemo" para decidir si se puede cancelar: el
          // DELETE del backend no lo mira, asi que el veterinario los cancela
          // igual desde la agenda.
          esDemo: true,
          // A diferencia de los dias completos, este se ve en la agenda del
          // admin: es el turno que tiene que poder cancelar.
          ocultoEnAgenda: false,
          user: { connect: { id: cliente.id } },
          mascota: { connect: { id: mascota.id } },
        },
      });
    }

    for (const motivo of MOTIVOS_VIERNES) {
      const hora = await primerHorarioLibre(sede, viernes, usadasViernes);
      if (hora === null) {
        sinEspacio += 1;
        continue;
      }
      usadasViernes.add(hora);
      const momento = new Date(`${viernes}T${hora}:00`).toISOString();
      await prisma.turno.create({
        data: {
          tipo: motivo.tipo,
          sede,
          fecha: viernes,
          hora,
          llegadaEn: momento,
          atendidoEn: momento,
          descripcion: motivo.descripcion,
          esDemo: false,
          ocultoEnAgenda: false,
          user: { connect: { id: cliente.id } },
          mascota: { connect: { id: mascota.id } },
        },
      });
    }
  }

  console.log(`Turnos de ${cliente.nombre} (${CLIENTE}):`);
  for (const mascota of mascotas) {
    const sede = SEDE_POR_MASCOTA[mascota.nombre] ?? 'por posicion';
    const deHoy = await prisma.turno.count({
      where: { mascotaId: mascota.id, fecha: hoy, atendidoEn: null },
    });
    console.log(`  ${mascota.nombre.padEnd(8)} ${sede.padEnd(14)} ${deHoy} de hoy, 3 el viernes`);
  }
  if (borrados.count > 0) {
    console.log(`(se rehízo la ronda anterior: ${borrados.count} turnos)`);
  }
  if (sinEspacio > 0) {
    console.log(`Ojo: ${sinEspacio} turnos noentraron porque no quedaban horarios libres.`);
  }
}

main()
  .catch((error: unknown) => {
    console.error('No se pudieron crear los turnos del cliente:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
