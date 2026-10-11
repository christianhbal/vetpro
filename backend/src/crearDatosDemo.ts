import path from 'node:path';
import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';

config({ path: path.resolve(__dirname, '..', '.env') });

const prisma = new PrismaClient();

const sedesVeterinaria = ['Recoleta', 'San Isidro', 'Vicente López'] as const;

function fechaComoValor(fecha: Date): string {
  return [
    fecha.getFullYear(),
    String(fecha.getMonth() + 1).padStart(2, '0'),
    String(fecha.getDate()).padStart(2, '0'),
  ].join('-');
}

// Turnos de ejemplo. Se scrapean de los dueños y mascotas que ya existen,
// por eso el script necesita al menos un usuario y una mascota en la base.
//
// Se generan para las TRES sedes y todos quedan pendientes de atender, que
// es lo que muestra la pantalla "Atender pacientes". Con eso siempre hay
// ejemplos visibles sin importar la sede que se haya elegido en Turnos.
const HORARIOS_PENDIENTES = ['10:30', '12:00', '14:30', '16:00', '17:30'] as const;

const TIPOS = ['Control', 'Vacunas', 'Estética'] as const;

// Un par de turnos ya completados, para que la seccion "Turnos completados"
// de la pantalla de Turnos tampoco quede vacia.
const COMPLETADOS = [
  {
    sede: 'Recoleta',
    hora: '11:00',
    descripcion: 'Se aplico la vacuna anual y la mascota quedo tranquila, sin reaccion.',
  },
  {
    sede: 'San Isidro',
    hora: '18:00',
    descripcion: 'Bano y corte. Se dejo comentario sobre el pelo para la proxima visita.',
  },
] as const;

async function main(): Promise<void> {
  const hoy = fechaComoValor(new Date());

  const anteriores = await prisma.turno.deleteMany({ where: { esDemo: true } });
  if (anteriores.count > 0) {
    console.log(`Se borraron ${anteriores.count} turnos de ejemplo previos.`);
  }

  const duenos = await prisma.usuario.findMany({
    where: { mascotas: { some: {} } },
    select: { id: true },
    orderBy: { id: 'asc' },
  });
  if (duenos.length === 0) {
    throw new Error('Ningun usuario tiene mascotas. Registra al menos una primero.');
  }

  // Arma la lista: pendientes en cada sede + un par de completados.
  const ejemplos: {
    tipo: string;
    sede: string;
    hora: string;
    minutosAtras: number;
    atendido: boolean;
    descripcion: string | null;
  }[] = [];

  let minuto = 5;
  for (const sede of sedesVeterinaria) {
    HORARIOS_PENDIENTES.forEach((hora, i) => {
      ejemplos.push({
        tipo: TIPOS[i % TIPOS.length],
        sede,
        hora,
        minutosAtras: minuto,
        atendido: false,
        descripcion: null,
      });
      minuto += 7;
    });
  }

  for (const [i, completado] of COMPLETADOS.entries()) {
    ejemplos.push({
      tipo: TIPOS[i % TIPOS.length],
      sede: completado.sede,
      hora: completado.hora,
      minutosAtras: 40 + i * 30,
      atendido: true,
      descripcion: completado.descripcion,
    });
  }

  const creados = [];
  for (const [indice, ejemplo] of ejemplos.entries()) {
    // Alterna entre las mascotas del dueño para que"Some tengan foto y otros no.
    const dueno = duenos[indice % duenos.length];
    const mascotas = await prisma.mascota.findMany({
      where: { userId: dueno.id },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    // indice par -> con foto, impar -> sin foto.
    const mascotaId = indice % 2 === 0 ? mascotas[0].id : (mascotas[1]?.id ?? mascotas[0].id);

    const llegada = new Date(Date.now() - ejemplo.minutosAtras * 60 * 1000).toISOString();
    const turno = await prisma.turno.create({
      data: {
        tipo: ejemplo.tipo,
        sede: ejemplo.sede,
        fecha: hoy,
        hora: ejemplo.hora,
        llegadaEn: llegada,
        atendidoEn: ejemplo.atendido ? llegada : null,
        descripcion: ejemplo.descripcion,
        esDemo: true,
        user: { connect: { id: dueno.id } },
        mascota: { connect: { id: mascotaId } },
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
      hora: turno.hora,
      atendido: ejemplo.atendido,
    });
  }

  console.log(`\nSe crearon ${creados.length} turnos de ejemplo para hoy (${hoy}):\n`);
  for (const turno of creados) {
    const estado = turno.atendido ? 'COMPLETADO' : 'PENDIENTE ';
    console.log(
      `  ${turno.id}  ${estado}  ${turno.hora}  ${turno.sede.padEnd(13)} ` +
        `${turno.mascota} (${turno.dueno})  foto: ${turno.conFoto ? 'si' : 'no'}`
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