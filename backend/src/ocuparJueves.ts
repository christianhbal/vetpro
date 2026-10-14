import path from 'node:path';
import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { HORARIOS, MARCA_DIA_COMPLETO } from './horarios';

config({ path: path.resolve(__dirname, '..', '.env') });

const prisma = new PrismaClient();

const sedesVeterinaria = ['Recoleta', 'San Isidro', 'Vicente López'] as const;

/**
 * indices de HORARIOS que quedan ocupados (0 = 10:00, 17 = 18:30).
 *
 * Son 9 de 18, la mitad. No van alternados porque queda como una fila de
 * puntos: se ocupa toda la manana y despues una hora sí y una no, que es como
 * se llena una veterinaria de verdad. Los que quedan libres dan el mismo
 * cantidad y se ven repartidos, no todos juntos al final.
 */
const OCUPADOS = [0, 1, 2, 3, 4, 5, 8, 10, 12];

// Igual que en bloquearDias: son turnos reales a proposito (el endpoint de
// disponibilidad ignora los esDemo) y llevan la marca para poder liberarlos con
// "npm run db:dias:liberar" sin tocar los turnos de verdad.
const MARCA = MARCA_DIA_COMPLETO;

/**
 * Mascotas que siempre van a la misma sede.
 *
 * Esta en dos scripts a proposito y no es lo mejor: Chloe esta anclada a San
 * Isidro en el generador de ejemplos y tambien tiene que estarlo acá, o en la
 * agenda aparece una mascota que cambia de sede de un cartel a otro.
 */
const SEDE_FIJA_POR_MASCOTA: Record<string, string> = {
  Chloe: 'San Isidro',
};

function fechaComoValor(fecha: Date): string {
  return [
    fecha.getFullYear(),
    String(fecha.getMonth() + 1).padStart(2, '0'),
    String(fecha.getDate()).padStart(2, '0'),
  ].join('-');
}

/**
 * El proximo jueves. Si hoy ya es jueves se usa el de hoy: si el usuario lo
 * corre un jueves a la mañana todavia hay horario para agendar y quiere ver el
 * dia que tiene abierto, no el de la semana que viene.
 */
function proximoJueves(): Date {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const dias = (4 - hoy.getDay() + 7) % 7;
  const cursor = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + dias);
  // La veterinaria no atiende los domingos; el jueves nunca cae en domingo,
  // pero si el desplazamiento se pasara de la semana se corre siete dias.
  if (cursor.getDay() === 0) cursor.setDate(cursor.getDate() + 7);
  return cursor;
}

async function main(): Promise<void> {
  const fecha = proximoJueves();
  const fechaComoTexto = fechaComoValor(fecha);

  // Primero se limpian los bloqueos de la ronda anterior. La marca y
  // ocultoEnAgenda los distinguen de cualquier turno agendado de verdad.
  const liberados = await prisma.turno.deleteMany({
    where: { descripcion: MARCA, ocultoEnAgenda: true },
  });
  if (liberados.count > 0) {
    console.log(`Se liberaron ${liberados.count} horarios de la ronda anterior.`);
  }

  const candidatas = await prisma.mascota.findMany({
    where: { userId: { not: null } },
    select: { id: true, userId: true, nombre: true },
    orderBy: { id: 'asc' },
  });
  if (candidatas.length === 0) {
    throw new Error('No hay mascotas con dueño. Registra al menos una primero.');
  }

  // Los que ya haya en esa fecha y esa sede no se tocan: solo se ocupan los
  // horarios que siguen libres, asi el script se puede correr dos veces.
  const yaOcupados = await prisma.turno.findMany({
    where: { fecha: fechaComoTexto },
    select: { sede: true, hora: true },
  });

  let creados = 0;
  for (const sede of sedesVeterinaria) {
    // Las ancladas a otra sede no van a esta.
    const paraEstaSede = candidatas.filter(
      (mascota) => (SEDE_FIJA_POR_MASCOTA[mascota.nombre] ?? null) === sede
    );
    const lista = paraEstaSede.length > 0 ? paraEstaSede : candidatas;

    let i = 0;
    for (const indice of OCUPADOS) {
      const hora = HORARIOS[indice];
      if (yaOcupados.some((turno) => turno.sede === sede && turno.hora === hora)) continue;

      const mascota = lista[i % lista.length];
      await prisma.turno.create({
        data: {
          tipo: i % 3 === 0 ? 'Vacunas' : i % 3 === 1 ? 'Control' : 'Estética',
          sede,
          fecha: fechaComoTexto,
          hora,
          // Sin llegada ni atencion: no aparecen en ninguna lista, solo ocupan
          // la agenda.
          llegadaEn: null,
          atendidoEn: null,
          descripcion: MARCA,
          esDemo: false,
          // Ocupan el calendario pero no salen en "Turnos siguientes": con 9 por
          // sede la pantalla mostraria una lista imposible de leer.
          ocultoEnAgenda: true,
          user: { connect: { id: mascota.userId as number } },
          mascota: { connect: { id: mascota.id } },
        },
      });
      i += 1;
      creados += 1;
    }
    console.log(`  ${fechaComoTexto}  ${sede.padEnd(13)} ${OCUPADOS.length} horarios ocupados`);
  }

  console.log(`\nJueves ${fechaComoTexto}: ${creados} horarios ocupados en las tres sedes.`);
  console.log(`Libres: ${HORARIOS.length - OCUPADOS.length} por sede.`);
  console.log('Para liberarlos: npm run db:dias:liberar');
}

main()
  .catch((error: unknown) => {
    console.error('No se pudo ocupar el jueves:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
