import path from 'node:path';
import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';

config({ path: path.resolve(__dirname, '..', '.env') });

const prisma = new PrismaClient();

function fechaComoValor(fecha: Date): string {
  return [
    fecha.getFullYear(),
    String(fecha.getMonth() + 1).padStart(2, '0'),
    String(fecha.getDate()).padStart(2, '0'),
  ].join('-');
}

// Turnos de ejemplo. Se scrapean de los dueños y mascotas que ya existen,
// por eso el script necesita al menos un usuario y una mascota en la base.
const EJEMPLOS = [
  {
    tipo: 'Control',
    sede: 'Recoleta',
    hora: '10:30',
    minutosAtras: 35,
    atendido: false,
    descripcion: null,
  },
  {
    tipo: 'Vacunas',
    sede: 'Recoleta',
    hora: '12:00',
    minutosAtras: 20,
    atendido: true,
    descripcion: 'Se aplico la vacuna anual y la mascota quedo tranquila, sin reaccion.',
  },
  {
    tipo: 'Estética',
    sede: 'San Isidro',
    hora: '16:00',
    minutosAtras: 80,
    atendido: true,
    descripcion: 'Bano y corte. Se dejo commento sobre el pelo para la proxima visita.',
  },
  {
    tipo: 'Control',
    sede: 'Vicente López',
    hora: '11:00',
    minutosAtras: 15,
    atendido: false,
    descripcion: null,
  },
  {
    tipo: 'Vacunas',
    sede: 'Recoleta',
    hora: '18:00',
    minutosAtras: 120,
    atendido: false,
    descripcion: null,
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

  const creados = [];
  for (const [indice, ejemplo] of EJEMPLOS.entries()) {
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
  console.log('\nPara borrarlos: npm run db:demo:borrar  (o la pantalla Datos de ejemplo).');
}

main()
  .catch((error: unknown) => {
    console.error('No se pudieron crear los turnos de ejemplo:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());