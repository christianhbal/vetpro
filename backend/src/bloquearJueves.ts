import path from 'node:path';
import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';

config({ path: path.resolve(__dirname, '..', '.env') });

const prisma = new PrismaClient();

const sedesVeterinaria = ['Recoleta', 'San Isidro', 'Vicente López'] as const;

// Cuantos jueves se dejan completos. Con 4 alcanza para ver el calendario en
// varias semanas sin llenar la base de turnos.
const CANTIDAD_JUEVES = 4;

// El backend atiende de lunes a sabado, entre las 10:00 y las 18:30, cada
// media hora. Llenar los 18 huecos deja el dia completamente ocupado.
const HORARIOS = Array.from({ length: 18 }, (_valor, i) => {
  const minutos = 10 * 60 + i * 30;
  return `${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}`;
});

// Estos turnos son reales a proposito: la agenda los tiene que mostrar como
// ocupados. Para poder distinguirlos de los turnos de verdad y liberarlos sin
// tocar nada importante, todos llevan esta marca en la descripcion.
const MARCA = 'ocupado por el ejemplo';

function fechaComoValor(fecha: Date): string {
  return [
    fecha.getFullYear(),
    String(fecha.getMonth() + 1).padStart(2, '0'),
    String(fecha.getDate()).padStart(2, '0'),
  ].join('-');
}

/** Los proximos N jueves a partir de hoy. Si hoy es jueves, arranca en 7 dias. */
function proximosJueves(cantidad: number): Date[] {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const jueves: Date[] = [];
  let cursor = new Date(hoy);
  while (jueves.length < cantidad) {
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
    if (cursor.getDay() === 4) jueves.push(new Date(cursor));
  }
  return jueves;
}

async function main(): Promise<void> {
  const fechas = proximosJueves(CANTIDAD_JUEVES).map(fechaComoValor);

  const liberados = await prisma.turno.deleteMany({ where: { descripcion: MARCA } });
  if (liberados.count > 0) {
    console.log(`Se liberaron ${liberados.count} horarios de la ronda anterior.`);
  }

  const duenos = await prisma.mascota.findMany({
    where: { userId: { not: null } },
    select: { id: true, userId: true },
    orderBy: { id: 'asc' },
  });
  const conDueno = duenos.flatMap((mascota) =>
    mascota.userId === null ? [] : [{ id: mascota.id, userId: mascota.userId }]
  );
  if (conDueno.length === 0) {
    throw new Error('No hay mascotas con dueño. Registra al menos una primero.');
  }

  console.log(`\nOcupando ${fechas.length} jueves completos en las tres sedes:\n`);

  let creados = 0;
  for (const fecha of fechas) {
    for (const sede of sedesVeterinaria) {
      let i = 0;
      for (const hora of HORARIOS) {
        const mascota = conDueno[i % conDueno.length];
        const tipo = i % 3 === 0 ? 'Vacunas' : i % 3 === 1 ? 'Control' : 'Estética';
        await prisma.turno.create({
          data: {
            tipo,
            sede,
            fecha,
            hora,
            // Sin llegada ni atencion: no aparecen en ninguna lista, solo
            // ocupan la agenda.
            llegadaEn: null,
            atendidoEn: null,
            descripcion: MARCA,
            esDemo: false,
            user: { connect: { id: mascota.userId } },
            mascota: { connect: { id: mascota.id } },
          },
        });
        i += 1;
        creados += 1;
      }
      console.log(`  ${fecha}  ${sede.padEnd(13)} ${HORARIOS.length} horarios ocupados`);
    }
  }

  console.log(`\nListo: ${creados} horarios bloqueados.`);
  console.log('Para liberarlos: npm run db:jueves:liberar');
}

main()
  .catch((error: unknown) => {
    console.error('No se pudieron bloquear los jueves:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());